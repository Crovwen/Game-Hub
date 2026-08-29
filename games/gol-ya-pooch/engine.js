'use strict';

/**
 * Gol Ya Pooch (گل یا پوچ) — server-authoritative engine.
 *
 * Flow per the spec: within a round, Player 1 guesses 5 times against
 * Player 2 (who secretly picks a fist each time), then roles swap and
 * Player 2 guesses 5 times against Player 1. Whoever had more correct
 * guesses in the round wins the match.
 *
 * Two explicit special cases from the spec, plus one documented
 * generalization (called out in README.md as an engineering decision
 * for an ambiguity in the original spec):
 *   - Both players go 5-for-5 correct  -> not a finish, +2 attempts each,
 *     play a sudden-death extension round.
 *   - Both players go 0-for-5 correct  -> match ends immediately as a
 *     draw ("Draw / Double Loss").
 *   - GENERALIZATION (ours): any other tie within a round (e.g. 3-3) is
 *     resolved the same way as the 5-5 case — a +2 sudden-death
 *     extension — since the spec only says what happens when a round
 *     is decisive or a total double-failure, not a partial tie. Treating
 *     "tied but not both-zero" the same as "tied at max" is the smallest
 *     change that keeps every stated rule true.
 *
 * The holder's secret choice never enters the guesser's (or a
 * spectator's) view — see viewFor().
 */

const HANDS = ['left', 'right'];

class GolYaPoochEngine {
  constructor(matchConfig) {
    this.matchConfig = matchConfig;
  }

  getInitialState() {
    const [p0, p1] = this.matchConfig.players;
    const players = {};
    players[p0.userId] = { seat: p0.seat, totalCorrect: 0, totalAttempts: 0 };
    players[p1.userId] = { seat: p1.seat, totalCorrect: 0, totalAttempts: 0 };

    return {
      status: 'in_progress',
      players,
      order: [p0.userId, p1.userId],
      currentRound: this._newRound(1, 5, p0.userId, p1.userId),
      roundHistory: [],
      winnerId: null,
      draw: false,
    };
  }

  _newRound(roundNumber, attemptsPerTurn, firstGuesserId, firstHolderId) {
    return {
      roundNumber,
      attemptsPerTurn,
      turnHalf: 1,
      guesserId: firstGuesserId,
      holderId: firstHolderId,
      attemptIndex: 0,
      pendingHolderChoice: null,
      halfResults: {},
    };
  }

  validateAction(state, userId, action) {
    if (state.status === 'finished') return { valid: false, error: 'بازی تمام شده است' };
    const round = state.currentRound;

    if (action.type === 'hide') {
      if (userId !== round.holderId) return { valid: false, error: 'شما در این مرحله گل‌گذار نیستید' };
      if (round.pendingHolderChoice !== null) return { valid: false, error: 'قبلاً انتخاب کرده‌اید' };
      if (!HANDS.includes(action.hand)) return { valid: false, error: 'دست نامعتبر' };
      return { valid: true };
    }

    if (action.type === 'guess') {
      if (userId !== round.guesserId) return { valid: false, error: 'نوبت حدس زدن شما نیست' };
      if (round.pendingHolderChoice === null) return { valid: false, error: 'هنوز حریف انتخاب نکرده است' };
      if (!HANDS.includes(action.hand)) return { valid: false, error: 'دست نامعتبر' };
      return { valid: true };
    }

    return { valid: false, error: 'نوع اکشن نامعتبر' };
  }

  applyAction(state, userId, action) {
    const check = this.validateAction(state, userId, action);
    if (!check.valid) throw new Error(check.error);

    const events = [];
    const next = structuredClone(state);
    const round = next.currentRound;

    if (action.type === 'hide') {
      round.pendingHolderChoice = action.hand;
      events.push({ type: 'holder_chose', payload: { userId } }); // hand itself is intentionally not logged as a broadcastable event
      return { state: next, events, finished: false, winnerId: null, draw: false, result: null };
    }

    // action.type === 'guess'
    const correct = action.hand === round.pendingHolderChoice;
    round.attemptIndex += 1;
    round.pendingHolderChoice = null;
    next.players[userId].totalAttempts += 1;
    if (correct) next.players[userId].totalCorrect += 1;
    events.push({ type: 'guess_result', payload: { userId, correct } });

    if (!round.halfResults[userId]) round.halfResults[userId] = 0;
    if (correct) round.halfResults[userId] += 1;

    if (round.attemptIndex < round.attemptsPerTurn) {
      // Same half continues — holder must hide again for the next attempt.
      return { state: next, events, finished: false, winnerId: null, draw: false, result: null };
    }

    if (round.turnHalf === 1) {
      // First half done — swap roles for the second half of this round.
      const [pA, pB] = next.order;
      const newGuesser = round.holderId; // the former holder now guesses
      const newHolder = round.guesserId; // the former guesser now holds
      next.currentRound = {
        ...round,
        turnHalf: 2,
        guesserId: newGuesser,
        holderId: newHolder,
        attemptIndex: 0,
        pendingHolderChoice: null,
      };
      events.push({ type: 'round_half_finished', payload: { half: 1 } });
      return { state: next, events, finished: false, winnerId: null, draw: false, result: null };
    }

    // turnHalf === 2 -> the round is fully complete, decide its outcome.
    const [userA, userB] = next.order;
    const scoreA = round.halfResults[userA] || 0;
    const scoreB = round.halfResults[userB] || 0;
    next.roundHistory.push({
      roundNumber: round.roundNumber,
      attemptsPerTurn: round.attemptsPerTurn,
      scores: { [userA]: scoreA, [userB]: scoreB },
    });
    events.push({ type: 'round_finished', payload: { roundNumber: round.roundNumber, scores: { [userA]: scoreA, [userB]: scoreB } } });

    if (scoreA === scoreB) {
      if (scoreA === 0) {
        next.status = 'finished';
        next.draw = true;
        next.winnerId = null;
        events.push({ type: 'match_draw', payload: { reason: 'double_zero' } });
        return {
          state: next,
          events,
          finished: true,
          winnerId: null,
          draw: true,
          result: { draw: true, reason: 'double_zero', totals: this._totals(next) },
        };
      }
      // Tied (including the 5-for-5 case) -> sudden-death extension.
      next.currentRound = this._newRound(round.roundNumber + 1, 2, userA, userB);
      events.push({ type: 'sudden_death_extension', payload: { attemptsPerTurn: 2 } });
      return { state: next, events, finished: false, winnerId: null, draw: false, result: null };
    }

    const winnerId = scoreA > scoreB ? userA : userB;
    next.status = 'finished';
    next.winnerId = winnerId;
    events.push({ type: 'match_won', payload: { userId: winnerId } });
    return {
      state: next,
      events,
      finished: true,
      winnerId,
      draw: false,
      result: { winnerId, totals: this._totals(next) },
    };
  }

  _totals(state) {
    const totals = {};
    for (const [userId, p] of Object.entries(state.players)) totals[userId] = p.totalCorrect;
    return totals;
  }

  viewFor(state, userId) {
    const view = structuredClone(state);
    if (view.currentRound && view.currentRound.holderId !== userId) {
      view.currentRound.pendingHolderChoice = view.currentRound.pendingHolderChoice !== null ? 'hidden' : null;
    }
    return view;
  }

  onPlayerDisconnect(state, _userId) {
    return state;
  }

  /** Whose action is Core currently waiting on? Used for turn-timeout enforcement. */
  getAwaitedUserId(state) {
    if (state.status === 'finished') return null;
    const round = state.currentRound;
    return round.pendingHolderChoice === null ? round.holderId : round.guesserId;
  }

  onTimeout(state, userId) {
    // If the idle player was supposed to hide or guess, auto-forfeit that
    // single attempt as incorrect/no-op so the match can't stall forever.
    const round = state.currentRound;
    if (state.status === 'finished') {
      return { state, events: [], finished: false, winnerId: null, draw: false, result: null };
    }
    if (userId === round.holderId && round.pendingHolderChoice === null) {
      return this.applyAction(state, userId, { type: 'hide', hand: HANDS[0] });
    }
    if (userId === round.guesserId && round.pendingHolderChoice !== null) {
      // guesser times out -> counts as a wrong guess, pick the hand that is wrong on purpose
      const wrongHand = HANDS.find((h) => h !== round.pendingHolderChoice);
      return this.applyAction(state, userId, { type: 'guess', hand: wrongHand });
    }
    return { state, events: [], finished: false, winnerId: null, draw: false, result: null };
  }
}

module.exports = { GolYaPoochEngine };

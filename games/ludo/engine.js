'use strict';

/**
 * Ludo (منچ) — server-authoritative engine.
 *
 * This engine does NOT extend backend/src/games/GameEngineBase on purpose:
 * a game plugin should not need to know anything about Core's internal file
 * layout. It just needs to implement the same method shapes (documented in
 * games/GAME_ENGINE_CONTRACT.md). The registry duck-types this at load time.
 *
 * Scope decision (documented, not hidden): full 4-player Ludo with the
 * complete set of house rules has many variants. This implementation uses
 * the widely-taught "standard" rule set:
 *   - 52-square shared ring, 4 colour start offsets 13 squares apart
 *   - a token needs a 6 to leave the yard
 *   - a token needs an EXACT roll to enter/finish its 6-square home column
 *     (57 total squares of travel: 51 shared + 6 private)
 *   - 8 safe squares (each colour's start square + 4 star squares) where
 *     no capture can happen
 *   - landing exactly on an opponent (non-safe, shared-ring square) sends
 *     it back to the yard
 *   - rolling a 6, capturing an opponent, or getting a token home all grant
 *     an extra roll, capped at 3 bonus rolls in a row (classic "three 6s"
 *     safety valve) to guarantee the turn always terminates
 *   - stacking your own tokens on one square is allowed (no "block" rule)
 *   - first player to get all 4 tokens home wins immediately (no 2nd/3rd
 *     place tracking)
 * These are called out in README.md as an explicit engineering decision.
 */

const RING_LENGTH = 52;
const HOME_COLUMN_LENGTH = 6;
const FINISH_STEP = RING_LENGTH - 1 + HOME_COLUMN_LENGTH; // 56 (0-indexed)
const TOKENS_PER_PLAYER = 4;
const MAX_BONUS_ROLLS_IN_A_ROW = 3;

const COLOR_START_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };
const ALL_COLORS = ['red', 'green', 'yellow', 'blue'];
// Opposite corners for the 2-player variant.
const TWO_PLAYER_COLORS = ['red', 'yellow'];
const SAFE_GLOBAL_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function globalPosition(color, step) {
  if (step > RING_LENGTH - 2) return null; // already in private home column, no shared-ring position
  return (COLOR_START_OFFSET[color] + step) % RING_LENGTH;
}

class LudoEngine {
  constructor(matchConfig) {
    this.matchConfig = matchConfig;
    this.rng = matchConfig.rng || Math.random;
  }

  _rollDie() {
    return Math.floor(this.rng() * 6) + 1;
  }

  getInitialState() {
    const { players } = this.matchConfig;
    const colors = players.length === 2 ? TWO_PLAYER_COLORS : ALL_COLORS.slice(0, players.length);
    const playersState = {};
    const turnOrder = [];

    players.forEach((p, idx) => {
      const color = colors[idx];
      turnOrder.push(p.userId);
      playersState[p.userId] = {
        seat: p.seat,
        color,
        tokens: Array.from({ length: TOKENS_PER_PLAYER }, (_, tokenId) => ({
          id: tokenId,
          pos: 'yard', // 'yard' | { step: 0..56 }
        })),
      };
    });

    return {
      status: 'in_progress',
      players: playersState,
      turnOrder,
      currentTurnIndex: 0,
      dice: null, // last rolled value awaiting a move, or null if a roll is needed
      pendingTokenIds: null, // token ids that are legal to move with the current dice
      bonusRollStreak: 0,
      winnerId: null,
      finishedAt: null,
    };
  }

  get _currentPlayerId() {
    // helper only used inside applyAction/validateAction via closures below
    return null;
  }

  _legalMoves(state, userId, dice) {
    const player = state.players[userId];
    const legal = [];
    for (const token of player.tokens) {
      if (token.pos === 'yard') {
        if (dice === 6) legal.push(token.id);
        continue;
      }
      const newStep = token.pos.step + dice;
      if (newStep <= FINISH_STEP) legal.push(token.id);
    }
    return legal;
  }

  validateAction(state, userId, action) {
    if (state.status === 'finished') return { valid: false, error: 'بازی تمام شده است' };
    const currentPlayerId = state.turnOrder[state.currentTurnIndex];
    if (userId !== currentPlayerId) return { valid: false, error: 'نوبت شما نیست' };
    if (!state.players[userId]) return { valid: false, error: 'بازیکن نامعتبر' };

    if (action.type === 'roll') {
      if (state.dice !== null) return { valid: false, error: 'قبلاً تاس ریخته شده، باید مهره حرکت کنید' };
      return { valid: true };
    }

    if (action.type === 'move') {
      if (state.dice === null) return { valid: false, error: 'ابتدا باید تاس بریزید' };
      if (!Number.isInteger(action.tokenId) || action.tokenId < 0 || action.tokenId >= TOKENS_PER_PLAYER) {
        return { valid: false, error: 'مهره نامعتبر' };
      }
      if (!state.pendingTokenIds || !state.pendingTokenIds.includes(action.tokenId)) {
        return { valid: false, error: 'حرکت این مهره با این عدد تاس مجاز نیست' };
      }
      return { valid: true };
    }

    return { valid: false, error: 'نوع اکشن نامعتبر' };
  }

  _advanceTurn(state) {
    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
    state.dice = null;
    state.pendingTokenIds = null;
    state.bonusRollStreak = 0;
  }

  applyAction(state, userId, action) {
    const check = this.validateAction(state, userId, action);
    if (!check.valid) throw new Error(check.error);

    const events = [];
    const next = structuredClone(state);

    if (action.type === 'roll') {
      const dice = this._rollDie();
      const legal = this._legalMoves(next, userId, dice);
      events.push({ type: 'dice_rolled', payload: { userId, dice } });

      if (legal.length === 0) {
        events.push({ type: 'no_valid_moves', payload: { userId, dice } });
        if (dice === 6 && next.bonusRollStreak < MAX_BONUS_ROLLS_IN_A_ROW - 1) {
          next.bonusRollStreak += 1;
          next.dice = null;
          next.pendingTokenIds = null;
        } else {
          this._advanceTurn(next);
        }
      } else {
        next.dice = dice;
        next.pendingTokenIds = legal;
      }

      return { state: next, events, finished: false, winnerId: null, draw: false, result: null };
    }

    // action.type === 'move'
    const dice = next.dice;
    const player = next.players[userId];
    const token = player.tokens.find((t) => t.id === action.tokenId);
    let captured = false;

    if (token.pos === 'yard') {
      token.pos = { step: 0 };
      events.push({ type: 'token_entered', payload: { userId, tokenId: token.id } });
    } else {
      token.pos = { step: token.pos.step + dice };
      events.push({ type: 'token_moved', payload: { userId, tokenId: token.id, step: token.pos.step } });
    }

    // Capture check — only on the shared ring, and never on a safe square.
    if (token.pos.step <= RING_LENGTH - 2) {
      const myGlobalPos = globalPosition(player.color, token.pos.step);
      if (myGlobalPos !== null && !SAFE_GLOBAL_SQUARES.has(myGlobalPos)) {
        for (const [otherUserId, otherPlayer] of Object.entries(next.players)) {
          if (otherUserId === userId) continue;
          for (const otherToken of otherPlayer.tokens) {
            if (otherToken.pos === 'yard') continue;
            if (otherToken.pos.step > RING_LENGTH - 2) continue; // safe in home column
            const otherGlobalPos = globalPosition(otherPlayer.color, otherToken.pos.step);
            if (otherGlobalPos === myGlobalPos) {
              otherToken.pos = 'yard';
              captured = true;
              events.push({ type: 'token_captured', payload: { by: userId, victim: otherUserId, tokenId: otherToken.id } });
            }
          }
        }
      }
    }

    const reachedHome = token.pos.step === FINISH_STEP;
    if (reachedHome) events.push({ type: 'token_reached_home', payload: { userId, tokenId: token.id } });

    const allHome = player.tokens.every((t) => t.pos !== 'yard' && t.pos.step === FINISH_STEP);
    if (allHome) {
      next.status = 'finished';
      next.winnerId = userId;
      next.finishedAt = new Date().toISOString();
      events.push({ type: 'match_won', payload: { userId } });
      return {
        state: next,
        events,
        finished: true,
        winnerId: userId,
        draw: false,
        result: { winnerId: userId, reason: 'all_tokens_home' },
      };
    }

    const bonusGranted = dice === 6 || captured || reachedHome;
    if (bonusGranted && next.bonusRollStreak < MAX_BONUS_ROLLS_IN_A_ROW - 1) {
      next.bonusRollStreak += 1;
      next.dice = null;
      next.pendingTokenIds = null;
    } else {
      this._advanceTurn(next);
    }

    return { state: next, events, finished: false, winnerId: null, draw: false, result: null };
  }

  viewFor(state, _userId) {
    // Ludo has no hidden information — every player sees the full board.
    return state;
  }

  /** Whose action is Core currently waiting on? Used for turn-timeout enforcement. */
  getAwaitedUserId(state) {
    if (state.status === 'finished') return null;
    return state.turnOrder[state.currentTurnIndex];
  }

  onPlayerDisconnect(state, _userId) {
    return state; // handled by the realtime layer's turn-timeout, not the engine
  }

  onTimeout(state, userId) {
    // Called by the realtime layer when the current player doesn't act in time.
    const currentPlayerId = state.turnOrder[state.currentTurnIndex];
    if (userId !== currentPlayerId) {
      return { state, events: [], finished: false, winnerId: null, draw: false, result: null };
    }
    const next = structuredClone(state);
    this._advanceTurn(next);
    return {
      state: next,
      events: [{ type: 'turn_timed_out', payload: { userId } }],
      finished: false,
      winnerId: null,
      draw: false,
      result: null,
    };
  }
}

module.exports = { LudoEngine, globalPosition, FINISH_STEP, RING_LENGTH };

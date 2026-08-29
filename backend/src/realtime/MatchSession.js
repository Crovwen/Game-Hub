'use strict';

const { prisma } = require('../db/prisma');
const registry = require('../games/registry');
const coinService = require('../economy/coinService');
const scoreService = require('../economy/scoreService');
const logger = require('../utils/logger');

const DEFAULT_TURN_TIMEOUT_SECONDS = 30;

class MatchSession {
  constructor({ matchId, gameId, mode, type, stake, players, engine, state }) {
    this.matchId = matchId;
    this.gameId = gameId;
    this.mode = mode; // 'random' | 'friend'
    this.type = type; // 'free' | 'staked'
    this.stake = stake;
    this.players = players; // [{ userId, seat }]
    this.engine = engine;
    this.state = state;
    this.sockets = new Map(); // userId -> ws
    this.turnTimer = null;
    this.onFinished = null; // set by sessionManager so it can remove this session
  }

  /** Rebuilds a session from the DB — used both for freshly-created matches and for reconnect/resume after a server restart. */
  static async load(matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { players: true } });
    if (!match) throw new Error(`Match ${matchId} not found`);

    const players = match.players
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ userId: p.userId, seat: p.seat }));

    const engine = registry.createEngine(match.gameId, {
      matchId: match.id,
      type: match.type,
      stake: match.stake,
      players,
    });

    const state = match.gameState || engine.getInitialState();

    return new MatchSession({
      matchId: match.id,
      gameId: match.gameId,
      mode: match.mode,
      type: match.type,
      stake: match.stake,
      players,
      engine,
      state,
    });
  }

  async persistInitialStateIfNeeded() {
    const match = await prisma.match.findUnique({ where: { id: this.matchId }, select: { gameState: true, status: true } });
    if (!match.gameState) {
      await prisma.match.update({
        where: { id: this.matchId },
        data: { gameState: this.state, status: 'playing', startedAt: new Date() },
      });
      logger.events.matchStarted(this.matchId);
    }
  }

  async attachSocket(userId, ws) {
    this.sockets.set(userId, ws);
    await prisma.matchPlayer.updateMany({ where: { matchId: this.matchId, userId }, data: { isConnected: true } });
    this._send(userId, { type: 'state', matchId: this.matchId, gameId: this.gameId, state: this.engine.viewFor(this.state, userId) });
    this._broadcastPresence();
    this._resetTurnTimer();
  }

  async detachSocket(userId) {
    this.sockets.delete(userId);
    await prisma.matchPlayer.updateMany({ where: { matchId: this.matchId, userId }, data: { isConnected: false } });
    this._broadcastPresence();
    // No forced action on disconnect alone — the turn timer (already running
    // for whoever the engine is waiting on) is what guarantees the match
    // can't stall forever. If the disconnected player isn't the one being
    // waited on, the match simply continues; they can resume any time
    // (spec section 17) by reconnecting and re-fetching /api/matches/active.
  }

  async handleAction(userId, action) {
    const validation = this.engine.validateAction(this.state, userId, action);
    if (!validation.valid) {
      this._send(userId, { type: 'action_rejected', error: validation.error });
      return;
    }

    let result;
    try {
      result = this.engine.applyAction(this.state, userId, action);
    } catch (err) {
      this._send(userId, { type: 'action_rejected', error: err.message });
      return;
    }

    this.state = result.state;
    await this._persistState();
    this._broadcastState();

    if (result.finished) {
      await this._finishMatch(result);
    } else {
      this._resetTurnTimer();
    }
  }

  _broadcastState() {
    for (const userId of this.sockets.keys()) {
      this._send(userId, { type: 'state', matchId: this.matchId, gameId: this.gameId, state: this.engine.viewFor(this.state, userId) });
    }
  }

  _broadcastPresence() {
    const presence = this.players.map((p) => ({ userId: p.userId, connected: this.sockets.has(p.userId) }));
    for (const userId of this.sockets.keys()) {
      this._send(userId, { type: 'presence', matchId: this.matchId, presence });
    }
  }

  _send(userId, message) {
    const ws = this.sockets.get(userId);
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(message));
    }
  }

  async _persistState() {
    await prisma.match.update({ where: { id: this.matchId }, data: { gameState: this.state } });
  }

  _resetTurnTimer() {
    clearTimeout(this.turnTimer);
    if (typeof this.engine.getAwaitedUserId !== 'function' || typeof this.engine.onTimeout !== 'function') return;

    const { manifest } = registry.getGame(this.gameId);
    const timeoutMs = (manifest.turnTimeoutSeconds || DEFAULT_TURN_TIMEOUT_SECONDS) * 1000;
    const awaitedUserId = this.engine.getAwaitedUserId(this.state);
    if (!awaitedUserId) return;

    this.turnTimer = setTimeout(() => this._handleTimeout(awaitedUserId), timeoutMs);
  }

  async _handleTimeout(userId) {
    const result = this.engine.onTimeout(this.state, userId);
    this.state = result.state;
    await this._persistState();
    this._broadcastState();
    if (result.finished) {
      await this._finishMatch(result);
    } else {
      this._resetTurnTimer();
    }
  }

  async _finishMatch(result) {
    clearTimeout(this.turnTimer);
    const userIds = this.players.map((p) => p.userId);

    await prisma.match.update({
      where: { id: this.matchId },
      data: {
        status: 'finished',
        winnerId: result.winnerId,
        isDraw: Boolean(result.draw),
        result: result.result || {},
        finishedAt: new Date(),
      },
    });
    logger.events.matchFinished(this.matchId, result.winnerId);

    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { gamesPlayed: { increment: 1 } } });
    if (!result.draw && result.winnerId) {
      const loserIds = userIds.filter((id) => id !== result.winnerId);
      await prisma.user.update({ where: { id: result.winnerId }, data: { wins: { increment: 1 } } });
      if (loserIds.length) {
        await prisma.user.updateMany({ where: { id: { in: loserIds } }, data: { losses: { increment: 1 } } });
      }
    }

    try {
      if (result.draw) {
        if (this.type === 'staked') {
          await coinService.refundDrawnStakedMatch(this.matchId, userIds, this.stake);
        }
        // free-mode draw: nobody owes/earns anything.
      } else if (result.winnerId) {
        if (this.type === 'staked') {
          await coinService.payoutStakedMatch(this.matchId, result.winnerId, this.stake);
        } else {
          await coinService.payoutFreeWinReward(this.matchId, result.winnerId);
        }
        await scoreService.awardMatchScore(this.matchId, result.winnerId, this.type, this.mode);
      }
    } catch (err) {
      // The match record is already marked finished (source of truth for
      // "who won"); a payout failure here is logged loudly for manual/ops
      // reconciliation rather than left silent. See README "Known
      // limitations" — a reconciliation job is the production hardening
      // step this MVP intentionally leaves for later.
      logger.error('payout_failed_after_match_finish', { matchId: this.matchId, error: err.message });
    }

    for (const userId of this.sockets.keys()) {
      this._send(userId, { type: 'match_finished', matchId: this.matchId, result });
    }

    if (typeof this.onFinished === 'function') this.onFinished(this.matchId);
  }
}

module.exports = { MatchSession };

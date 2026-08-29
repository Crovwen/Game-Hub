'use strict';

/**
 * GameEngineBase — the contract between Core and every game plugin.
 *
 * Core (MatchSession / matchmaking / API) only ever talks to a game through
 * this interface. It never imports ludo/* or gol-ya-pooch/* directly — it
 * asks the Game Registry for the engine class registered under a game id
 * and calls these methods. This is what lets a brand new game be dropped
 * into /games/<id>/ and picked up with zero changes to Core.
 *
 * A concrete engine (see games/ludo/engine.js, games/gol-ya-pooch/engine.js)
 * must extend this class and implement:
 *
 *   constructor(matchConfig)
 *     matchConfig: {
 *       matchId: string,
 *       type: 'free' | 'staked',
 *       stake: number,
 *       players: [{ userId: string, seat: number }, ...],
 *       rng: () => number  // injected RNG in [0,1), always use this instead
 *                          // of Math.random so engines stay deterministic
 *                          // and testable.
 *     }
 *
 *   getInitialState() -> plain JSON-serializable object
 *     Called once when the match transitions from 'ready' to 'playing'.
 *
 *   validateAction(state, userId, action) -> { valid: boolean, error?: string }
 *     MUST be side-effect free. Called before applyAction so the realtime
 *     layer can reject illegal client actions without mutating state.
 *
 *   applyAction(state, userId, action) -> {
 *     state: newState,                 // new authoritative state
 *     events: [{ type, payload }],     // for logging / analytics
 *     finished: boolean,
 *     winnerId: string | null,         // null allowed only when draw=true
 *     draw: boolean,                   // true for e.g. gol-ya-pooch double loss
 *     result: object | null            // arbitrary per-game summary, stored on Match.result
 *   }
 *     This is the ONLY place state may change. Must be a pure function of
 *     (state, userId, action) plus this.rng — no reads from Date.now() for
 *     game-affecting logic (timers belong to the realtime layer, not the engine).
 *
 *   viewFor(state, userId) -> stateForThatPlayer
 *     Strips hidden information a given player must not see (e.g. which
 *     fist holds the "gol" before they guess). Default: identity function
 *     (public state games like Ludo don't need to hide anything).
 *
 *   onPlayerDisconnect(state, userId) -> newState   [optional]
 *   onTimeout(state, userId) -> same shape as applyAction   [optional]
 *     Called by the realtime layer, not by players, when a seat goes idle.
 *     Default implementation is a no-op / not supported (session layer will
 *     just wait) — override when a game needs auto-skip behaviour.
 */
class GameEngineBase {
  constructor(matchConfig) {
    if (new.target === GameEngineBase) {
      throw new Error('GameEngineBase is abstract and cannot be instantiated directly');
    }
    this.matchConfig = matchConfig;
  }

  getInitialState() {
    throw new Error('getInitialState() not implemented');
  }

  validateAction(_state, _userId, _action) {
    throw new Error('validateAction() not implemented');
  }

  applyAction(_state, _userId, _action) {
    throw new Error('applyAction() not implemented');
  }

  viewFor(state, _userId) {
    return state;
  }

  onPlayerDisconnect(state, _userId) {
    return state;
  }

  onTimeout(state, _userId) {
    return { state, events: [], finished: false, winnerId: null, draw: false, result: null };
  }
}

module.exports = { GameEngineBase };

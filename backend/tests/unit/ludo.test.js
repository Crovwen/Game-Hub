'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LudoEngine, globalPosition, FINISH_STEP } = require('../../../games/ludo/engine');

// Turns an array of desired dice values [6,3,6,...] into an rng() the engine
// will read via Math.floor(rng()*6)+1, so we return values that map exactly.
function scriptedRng(diceSequence) {
  const queue = [...diceSequence];
  return () => {
    const dice = queue.shift();
    if (dice === undefined) throw new Error('scriptedRng ran out of values');
    // Math.floor(x*6)+1 === dice  =>  x in [(dice-1)/6, dice/6)
    return (dice - 1) / 6 + 0.0001;
  };
}

function makeEngine(diceSequence, players = [{ userId: 'A', seat: 0 }, { userId: 'B', seat: 1 }]) {
  return new LudoEngine({ matchId: 'm1', type: 'free', stake: 0, players, rng: scriptedRng(diceSequence) });
}

test('initial state: 2 players get opposite colors and empty yards', () => {
  const engine = makeEngine([]);
  const state = engine.getInitialState();
  assert.equal(state.turnOrder.length, 2);
  assert.equal(state.players.A.color, 'red');
  assert.equal(state.players.B.color, 'yellow');
  assert.equal(state.players.A.tokens.every((t) => t.pos === 'yard'), true);
  assert.equal(state.currentTurnIndex, 0);
});

test('rolling a non-6 with everything in yard skips the turn', () => {
  const engine = makeEngine([3]);
  let state = engine.getInitialState();
  const res = engine.applyAction(state, 'A', { type: 'roll' });
  assert.equal(res.state.currentTurnIndex, 1, 'turn should pass to player B');
  assert.equal(res.state.dice, null);
});

test('rolling a 6 lets a yard token enter, and grants a bonus roll', () => {
  const engine = makeEngine([6]);
  let state = engine.getInitialState();
  const rolled = engine.applyAction(state, 'A', { type: 'roll' });
  assert.deepEqual(rolled.state.pendingTokenIds, [0, 1, 2, 3]);

  const moved = engine.applyAction(rolled.state, 'A', { type: 'move', tokenId: 0 });
  assert.deepEqual(moved.state.players.A.tokens[0].pos, { step: 0 });
  // bonus roll: still A's turn
  assert.equal(moved.state.currentTurnIndex, 0);
  assert.equal(moved.state.dice, null);
});

test('rejects moving out of turn', () => {
  const engine = makeEngine([6]);
  const state = engine.getInitialState();
  assert.throws(() => engine.applyAction(state, 'B', { type: 'roll' }));
});

test('rejects an illegal token id for the current dice', () => {
  const engine = makeEngine([3]);
  let state = engine.getInitialState();
  // manually put token 0 on the board so a 3 has a legal target only for token 0
  state.players.A.tokens[0].pos = { step: 5 };
  const rolled = engine.applyAction(state, 'A', { type: 'roll' });
  assert.deepEqual(rolled.state.pendingTokenIds, [0]);
  assert.throws(() => engine.applyAction(rolled.state, 'A', { type: 'move', tokenId: 1 }));
});

test('capturing an opponent sends it back to the yard and grants a bonus roll', () => {
  const engine = makeEngine([4]);
  let state = engine.getInitialState();
  // Red token near a landing spot; Yellow token sitting exactly where Red will land.
  state.players.A.tokens[0].pos = { step: 10 }; // red global pos = (0+10)%52 = 10
  // Yellow start offset = 26, want global pos 14 (not a safe square) after B's token has travelled step s where (26+s)%52===14 => s = 40
  state.players.B.tokens[0].pos = { step: 40 };
  assert.equal(globalPosition('yellow', 40), 14);

  const rolled = engine.applyAction(state, 'A', { type: 'roll' }); // dice = 4 -> red step 10+4=14 -> global 14
  assert.ok(rolled.state.pendingTokenIds.includes(0));
  const moved = engine.applyAction(rolled.state, 'A', { type: 'move', tokenId: 0 });

  assert.equal(moved.state.players.B.tokens[0].pos, 'yard', 'captured token must return to yard');
  assert.equal(moved.state.currentTurnIndex, 0, 'capturing grants a bonus roll, still A turn');
  const captureEvent = moved.events.find((e) => e.type === 'token_captured');
  assert.ok(captureEvent, 'a token_captured event must be emitted');
});

test('no capture happens on a safe square', () => {
  const engine = makeEngine([4]);
  let state = engine.getInitialState();
  state.players.A.tokens[0].pos = { step: 10 };
  // Put B token exactly on global 14 too, but 14 is not one of our safe squares (8,21,34,47,0,13,26,39) — pick a genuinely safe one instead: global 21 is safe.
  // Red token at step 21 lands on global 21 (safe). Opponent parked there should NOT be captured.
  state.players.A.tokens[0].pos = { step: 17 }; // 17+4=21
  state.players.B.tokens[0].pos = { step: 21 - 26 < 0 ? 21 - 26 + 52 : 21 - 26 }; // yellow step s such that (26+s)%52 === 21
  const s = (21 - 26 + 52) % 52;
  state.players.B.tokens[0].pos = { step: s };
  assert.equal(globalPosition('yellow', s), 21);

  const rolled = engine.applyAction(state, 'A', { type: 'roll' });
  const moved = engine.applyAction(rolled.state, 'A', { type: 'move', tokenId: 0 });
  assert.notEqual(moved.state.players.B.tokens[0].pos, 'yard', 'token on a safe square must not be captured');
});

test('a token cannot overshoot the finish square', () => {
  const engine = makeEngine([5]);
  let state = engine.getInitialState();
  state.players.A.tokens[0].pos = { step: FINISH_STEP - 2 }; // needs exactly 2, a 5 overshoots
  const rolled = engine.applyAction(state, 'A', { type: 'roll' });
  const canMoveToken0 = Array.isArray(rolled.state.pendingTokenIds) && rolled.state.pendingTokenIds.includes(0);
  assert.equal(canMoveToken0, false, 'overshooting token must not be a legal move');
});

test('getting all 4 tokens home wins the match', () => {
  const engine = makeEngine([1]);
  let state = engine.getInitialState();
  state.players.A.tokens[0].pos = { step: FINISH_STEP };
  state.players.A.tokens[1].pos = { step: FINISH_STEP };
  state.players.A.tokens[2].pos = { step: FINISH_STEP };
  state.players.A.tokens[3].pos = { step: FINISH_STEP - 1 };
  const rolled = engine.applyAction(state, 'A', { type: 'roll' }); // dice=1, token 3 -> FINISH_STEP
  const moved = engine.applyAction(rolled.state, 'A', { type: 'move', tokenId: 3 });
  assert.equal(moved.finished, true);
  assert.equal(moved.winnerId, 'A');
  assert.equal(moved.state.status, 'finished');
});

test('onTimeout forces the turn to advance', () => {
  const engine = makeEngine([]);
  const state = engine.getInitialState();
  const res = engine.onTimeout(state, 'A');
  assert.equal(res.state.currentTurnIndex, 1);
});

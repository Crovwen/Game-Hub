'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GolYaPoochEngine } = require('../../../games/gol-ya-pooch/engine');

function makeEngine(players = [{ userId: 'A', seat: 0 }, { userId: 'B', seat: 1 }]) {
  return new GolYaPoochEngine({ matchId: 'm1', type: 'free', stake: 0, players });
}

// Plays one "attempt": holder hides `hiddenHand`, guesser guesses `guessHand`.
function playAttempt(engine, state, holderId, hiddenHand, guesserId, guessHand) {
  let res = engine.applyAction(state, holderId, { type: 'hide', hand: hiddenHand });
  res = engine.applyAction(res.state, guesserId, { type: 'guess', hand: guessHand });
  return res;
}

test('initial state: A guesses first half, B holds first half', () => {
  const engine = makeEngine();
  const state = engine.getInitialState();
  assert.equal(state.currentRound.guesserId, 'A');
  assert.equal(state.currentRound.holderId, 'B');
  assert.equal(state.currentRound.attemptsPerTurn, 5);
});

test('guesser view never reveals the holder secret choice', () => {
  const engine = makeEngine();
  let state = engine.getInitialState();
  const res = engine.applyAction(state, 'B', { type: 'hide', hand: 'left' });
  const guesserView = engine.viewFor(res.state, 'A');
  const holderView = engine.viewFor(res.state, 'B');
  assert.notEqual(guesserView.currentRound.pendingHolderChoice, 'left');
  assert.equal(holderView.currentRound.pendingHolderChoice, 'left');
});

test('rejects a guess before the holder has hidden', () => {
  const engine = makeEngine();
  const state = engine.getInitialState();
  assert.throws(() => engine.applyAction(state, 'A', { type: 'guess', hand: 'left' }));
});

test('rejects hiding twice in a row', () => {
  const engine = makeEngine();
  let state = engine.getInitialState();
  const res = engine.applyAction(state, 'B', { type: 'hide', hand: 'left' });
  assert.throws(() => engine.applyAction(res.state, 'B', { type: 'hide', hand: 'right' }));
});

test('full round: 4/5 vs 2/5 -> higher scorer (A) wins, per the spec example', () => {
  const engine = makeEngine();
  let state = engine.getInitialState();

  // Half 1: A guesses, B holds. Script: correct, correct, correct, correct, wrong => 4/5
  const half1 = [
    ['left', 'left'], ['right', 'right'], ['left', 'left'], ['right', 'right'], ['left', 'right'],
  ];
  for (const [hidden, guess] of half1) {
    const r = playAttempt(engine, state, 'B', hidden, 'A', guess);
    state = r.state;
  }
  assert.equal(state.currentRound.turnHalf, 2);
  assert.equal(state.currentRound.guesserId, 'B');
  assert.equal(state.currentRound.holderId, 'A');

  // Half 2: B guesses, A holds. Script: correct, correct, wrong, wrong, wrong => 2/5
  const half2 = [
    ['left', 'left'], ['right', 'right'], ['left', 'right'], ['right', 'left'], ['left', 'right'],
  ];
  let finalRes;
  for (const [hidden, guess] of half2) {
    finalRes = playAttempt(engine, state, 'A', hidden, 'B', guess);
    state = finalRes.state;
  }

  assert.equal(finalRes.finished, true);
  assert.equal(finalRes.winnerId, 'A');
  assert.equal(state.players.A.totalCorrect, 4);
  assert.equal(state.players.B.totalCorrect, 2);
});

test('both players 0/5 in a round -> draw / double loss, match ends', () => {
  const engine = makeEngine();
  let state = engine.getInitialState();
  const allWrong = [
    ['left', 'right'], ['left', 'right'], ['left', 'right'], ['left', 'right'], ['left', 'right'],
  ];
  let res;
  for (const [hidden, guess] of allWrong) {
    res = playAttempt(engine, state, 'B', hidden, 'A', guess);
    state = res.state;
  }
  for (const [hidden, guess] of allWrong) {
    res = playAttempt(engine, state, 'A', hidden, 'B', guess);
    state = res.state;
  }
  assert.equal(res.finished, true);
  assert.equal(res.draw, true);
  assert.equal(res.winnerId, null);
  assert.equal(state.status, 'finished');
});

test('both players 5/5 -> sudden death extension, not a finish', () => {
  const engine = makeEngine();
  let state = engine.getInitialState();
  const allRight = [
    ['left', 'left'], ['right', 'right'], ['left', 'left'], ['right', 'right'], ['left', 'left'],
  ];
  let res;
  for (const [hidden, guess] of allRight) {
    res = playAttempt(engine, state, 'B', hidden, 'A', guess);
    state = res.state;
  }
  for (const [hidden, guess] of allRight) {
    res = playAttempt(engine, state, 'A', hidden, 'B', guess);
    state = res.state;
  }
  assert.equal(res.finished, false, 'a perfect tie must not end the match');
  assert.equal(state.currentRound.roundNumber, 2);
  assert.equal(state.currentRound.attemptsPerTurn, 2, 'extension round grants +2 attempts');
});

test('onTimeout auto-forfeits the idle side without crashing the match', () => {
  const engine = makeEngine();
  let state = engine.getInitialState();
  // holder (B) times out before hiding
  let res = engine.onTimeout(state, 'B');
  assert.equal(res.state.currentRound.pendingHolderChoice !== null, true);
  // guesser (A) times out after holder hid -> counted as a wrong guess
  res = engine.onTimeout(res.state, 'A');
  assert.equal(res.state.players.A.totalAttempts, 1);
  assert.equal(res.state.players.A.totalCorrect, 0);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../src/economy/rules');

test('score table matches the spec exactly', () => {
  assert.equal(rules.scoreForWin('staked', 'random'), 200);
  assert.equal(rules.scoreForWin('free', 'random'), 100);
  assert.equal(rules.scoreForWin('staked', 'friend'), 50);
  assert.equal(rules.scoreForWin('free', 'friend'), 25);
});

test('free win pays 100 coins', () => {
  assert.equal(rules.freeWinCoins(), 100);
});

test('staked winner nets exactly the stake amount (200)', () => {
  assert.equal(rules.stakedWinnerNetCoins(), 200);
  assert.equal(rules.STAKE_AMOUNT, 200);
});

test('canAffordStake rejects balances under 200', () => {
  assert.equal(rules.canAffordStake(199), false);
  assert.equal(rules.canAffordStake(200), true);
  assert.equal(rules.canAffordStake(500), true);
});

test('unknown type/mode combination throws instead of silently returning 0', () => {
  assert.throws(() => rules.scoreForWin('staked', 'tournament'));
});

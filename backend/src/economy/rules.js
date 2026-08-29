'use strict';

/**
 * Pure economy rules. No DB, no I/O — just "how many coins/score points
 * does an outcome produce", straight out of the spec (sections 4-6):
 *
 *   Coins:
 *     free + random  win -> +100      loss -> 0
 *     staked + *     win -> +STAKE    loss -> -STAKE   (stake already left
 *                                     the balance when it was locked, so a
 *                                     loss needs no further coin change —
 *                                     see coinService.settleStakedMatch)
 *
 *   Score (never decreases on a loss, ever):
 *     staked + random  win -> +200    loss -> 0
 *     free   + random  win -> +100    loss -> 0
 *     staked + friend  win -> +50     loss -> 0
 *     free   + friend  win -> +25     loss -> 0
 */

const STAKE_AMOUNT = 200;
const FREE_WIN_COINS = 100;
const MIN_COINS_TO_JOIN_STAKED = STAKE_AMOUNT;

const SCORE_TABLE = {
  'staked:random': 200,
  'free:random': 100,
  'staked:friend': 50,
  'free:friend': 25,
};

function scoreKey(type, mode) {
  return `${type}:${mode}`;
}

/** Score points a winner earns. Losers always earn 0 — score never drops. */
function scoreForWin(type, mode) {
  const key = scoreKey(type, mode);
  if (!(key in SCORE_TABLE)) throw new Error(`Unknown type/mode combination for score: ${key}`);
  return SCORE_TABLE[key];
}

/** Coins a winner nets (on top of getting their own stake back), for a staked match. */
function stakedWinnerNetCoins() {
  return STAKE_AMOUNT;
}

/** Coins a free-mode winner earns. Free matches have no stake at all. */
function freeWinCoins() {
  return FREE_WIN_COINS;
}

function canAffordStake(currentCoinBalance) {
  return currentCoinBalance >= MIN_COINS_TO_JOIN_STAKED;
}

module.exports = {
  STAKE_AMOUNT,
  FREE_WIN_COINS,
  MIN_COINS_TO_JOIN_STAKED,
  scoreForWin,
  stakedWinnerNetCoins,
  freeWinCoins,
  canAffordStake,
};

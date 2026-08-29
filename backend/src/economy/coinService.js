'use strict';

const { prisma } = require('../db/prisma');
const rules = require('./rules');
const logger = require('../utils/logger');

class InsufficientFundsError extends Error {
  constructor(userId) {
    super(`user ${userId} has insufficient coins`);
    this.name = 'InsufficientFundsError';
    this.code = 'INSUFFICIENT_FUNDS';
    this.userId = userId;
  }
}

/**
 * The core primitive: apply one signed coin movement to one user, exactly
 * once, no matter how many times this function is called with the same
 * idempotencyKey (retries, double-clicks, reconnect-triggered re-sends).
 *
 * Safety properties:
 *  - Debits use a conditional `WHERE coins >= amount` update, so a balance
 *    can never go negative even under concurrent requests (no separate
 *    read-then-write race window).
 *  - The ledger row (CoinTransaction) and the balance update happen in the
 *    same DB transaction, so the cached `User.coins` and the append-only
 *    ledger can never drift apart.
 *  - idempotencyKey has a DB-level unique constraint. If two callers race
 *    with the same key, the loser's transaction fails on that constraint
 *    and rolls back entirely (Postgres also rolls back its own balance
 *    change), and we simply return the winner's already-committed result.
 */
async function applyLedgerEntryWithClient(tx, { userId, amount, type, reference, idempotencyKey }) {
  const existing = await tx.coinTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { alreadyApplied: true, balanceAfter: existing.balanceAfter };
  }

  const where = { id: userId };
  if (amount < 0) where.coins = { gte: -amount };

  const updateResult = await tx.user.updateMany({ where, data: { coins: { increment: amount } } });
  if (updateResult.count === 0) {
    throw new InsufficientFundsError(userId);
  }

  const user = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
  await tx.coinTransaction.create({
    data: { userId, amount, type, reference, idempotencyKey, balanceAfter: user.coins },
  });

  logger.events.coinTransaction(userId, amount, type);
  return { alreadyApplied: false, balanceAfter: user.coins };
}

async function applyLedgerEntry(params) {
  try {
    return await prisma.$transaction((tx) => applyLedgerEntryWithClient(tx, params));
  } catch (err) {
    if (err.code === 'P2002') {
      // Lost the race to a concurrent identical request — that's fine,
      // the operation still happened exactly once. Return its result.
      const existing = await prisma.coinTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) return { alreadyApplied: true, balanceAfter: existing.balanceAfter };
    }
    throw err;
  }
}

/** Granted once, ever, per user — the 1000-coin welcome balance (spec section 4). */
async function grantInitialCoins(userId, amount = rules.MIN_COINS_TO_JOIN_STAKED * 5) {
  return applyLedgerEntry({
    userId,
    amount,
    type: 'initial_grant',
    reference: null,
    idempotencyKey: `initial_grant:${userId}`,
  });
}

/**
 * Locks every player's stake for a staked match atomically: either every
 * player has enough coins and all of them get debited together, or nobody
 * does. This is what prevents "double spend" — a player can never be short
 * a stake for one match because it was mid-debit for another, since each
 * lock is its own all-or-nothing transaction keyed to a specific matchId.
 */
async function lockStakesForMatch(matchId, userIds, stakeAmount) {
  return prisma.$transaction(async (tx) => {
    const results = {};
    for (const userId of userIds) {
      results[userId] = await applyLedgerEntryWithClient(tx, {
        userId,
        amount: -stakeAmount,
        type: 'stake_lock',
        reference: matchId,
        idempotencyKey: `stake_lock:${matchId}:${userId}`,
      });
    }
    return results;
  });
}

/** Used when a match is cancelled/expired before it really starts — gives every locked stake back. */
async function refundStakesForMatch(matchId, userIds, stakeAmount) {
  return prisma.$transaction(async (tx) => {
    const results = {};
    for (const userId of userIds) {
      results[userId] = await applyLedgerEntryWithClient(tx, {
        userId,
        amount: stakeAmount,
        type: 'stake_refund',
        reference: matchId,
        idempotencyKey: `stake_refund:${matchId}:${userId}`,
      });
    }
    return results;
  });
}

/**
 * Pays the winner of a staked match the full pot (their own stake back plus
 * the loser's stake — net effect: winner +stake, loser stays at -stake
 * from the lock step, exactly matching spec section 22's worked example).
 * Idempotent per (matchId, winnerId) — calling this twice for the same
 * finished match (e.g. a duplicate "match finished" event after a
 * reconnect) never pays out twice.
 */
async function payoutStakedMatch(matchId, winnerId, stakeAmount) {
  const pot = stakeAmount * 2;
  return applyLedgerEntry({
    userId: winnerId,
    amount: pot,
    type: 'match_payout',
    reference: matchId,
    idempotencyKey: `match_payout:${matchId}:${winnerId}`,
  });
}

/** Free-mode win reward (+100 coins), idempotent per (matchId, winnerId). */
async function payoutFreeWinReward(matchId, winnerId) {
  return applyLedgerEntry({
    userId: winnerId,
    amount: rules.freeWinCoins(),
    type: 'free_win_reward',
    reference: matchId,
    idempotencyKey: `free_win_reward:${matchId}:${winnerId}`,
  });
}

/** A double-loss draw in a staked match refunds both stakes (nobody "won" the pot). */
async function refundDrawnStakedMatch(matchId, userIds, stakeAmount) {
  return refundStakesForMatch(matchId, userIds, stakeAmount);
}

module.exports = {
  InsufficientFundsError,
  grantInitialCoins,
  lockStakesForMatch,
  refundStakesForMatch,
  payoutStakedMatch,
  payoutFreeWinReward,
  refundDrawnStakedMatch,
};

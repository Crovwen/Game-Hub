'use strict';

const { prisma } = require('../db/prisma');
const rules = require('./rules');
const logger = require('../utils/logger');

async function awardScoreWithClient(tx, { userId, amount, type, reference, idempotencyKey }) {
  const existing = await tx.scoreTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) return { alreadyApplied: true, balanceAfter: existing.balanceAfter };

  await tx.user.update({ where: { id: userId }, data: { score: { increment: amount } } });
  const user = await tx.user.findUnique({ where: { id: userId }, select: { score: true } });
  await tx.scoreTransaction.create({
    data: { userId, amount, type, reference, idempotencyKey, balanceAfter: user.score },
  });

  logger.events.scoreTransaction(userId, amount, type);
  return { alreadyApplied: false, balanceAfter: user.score };
}

async function awardScore(params) {
  try {
    return await prisma.$transaction((tx) => awardScoreWithClient(tx, params));
  } catch (err) {
    if (err.code === 'P2002') {
      const existing = await prisma.scoreTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) return { alreadyApplied: true, balanceAfter: existing.balanceAfter };
    }
    throw err;
  }
}

/**
 * Awards the winner's score for a finished match. Losers never lose score
 * (spec section 6) so there is nothing to call for them — a match without
 * a winner (draw) simply awards nobody.
 */
async function awardMatchScore(matchId, winnerId, type, mode) {
  const amount = rules.scoreForWin(type, mode);
  return awardScore({
    userId: winnerId,
    amount,
    type: `${type}_${mode}_win`,
    reference: matchId,
    idempotencyKey: `score:${matchId}:${winnerId}`,
  });
}

module.exports = { awardScore, awardMatchScore };

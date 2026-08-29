'use strict';

const { prisma } = require('../db/prisma');
const registry = require('../games/registry');
const coinService = require('../economy/coinService');
const rules = require('../economy/rules');
const logger = require('../utils/logger');
const sessionManager = require('../realtime/sessionManager');

class MatchmakingError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MatchmakingError';
    this.code = code;
  }
}

// gameId:type -> [{ userId, joinedAt }]
// Single free-tier instance => plain in-memory queue is correct and simple.
// See sessionManager.js for the same reasoning about not needing Redis yet.
const queues = new Map();
// userId -> queued key, so a user can only be in one queue at a time and can cancel it.
const userQueueKey = new Map();
// userId -> [{ type: 'insufficient_funds' | 'matched' | 'cancelled', ... }]
// Drained by the API poll endpoint / WS "hello" message — see api/routes/games.routes.js
const pendingNotifications = new Map();

function queueKey(gameId, type) {
  return `${gameId}:${type}`;
}

function pushNotification(userId, notification) {
  if (!pendingNotifications.has(userId)) pendingNotifications.set(userId, []);
  pendingNotifications.get(userId).push(notification);
}

function drainNotifications(userId) {
  const list = pendingNotifications.get(userId) || [];
  pendingNotifications.delete(userId);
  return list;
}

async function assertCanAffordIfStaked(userId, type) {
  if (type !== 'staked') return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
  if (!user || !rules.canAffordStake(user.coins)) {
    throw new MatchmakingError('🪙 موجودی کافی نیست', 'INSUFFICIENT_FUNDS');
  }
}

/** Creates the Match + MatchPlayer rows, locks stakes if needed, and boots the live session. Shared by both random and friend flows. */
async function createMatchFromPlayers({ gameId, mode, type, playerUserIds }) {
  const { manifest } = registry.getGame(gameId);
  const stake = type === 'staked' ? rules.STAKE_AMOUNT : 0;

  const match = await prisma.match.create({
    data: {
      gameId,
      mode,
      type,
      stake,
      status: 'ready',
      players: {
        create: playerUserIds.map((userId, seat) => ({ userId, seat })),
      },
    },
  });

  if (type === 'staked') {
    try {
      await coinService.lockStakesForMatch(match.id, playerUserIds, stake);
    } catch (err) {
      // All-or-nothing: nobody was actually debited (see coinService), so
      // it's safe to just cancel this match record and let the caller retry.
      await prisma.match.update({ where: { id: match.id }, data: { status: 'cancelled' } });
      if (err.code === 'INSUFFICIENT_FUNDS' && err.userId) {
        pushNotification(err.userId, { type: 'insufficient_funds', gameId });
      }
      throw err;
    }
  }

  logger.events.matchCreated(match.id, gameId);

  // getOrLoadSession() builds the engine, computes the initial state, and
  // persists it (flipping status -> 'playing') — see sessionManager.js.
  await sessionManager.getOrLoadSession(match.id);

  return match;
}

/**
 * Joins the random queue for a game+type. When enough players have
 * accumulated (manifest.defaultRandomPlayers), a match is created
 * immediately for the first N in line. Returns either { status: 'queued' }
 * or { status: 'matched', matchId }.
 */
async function joinRandomQueue(userId, gameId, type) {
  const { manifest } = registry.getGame(gameId);
  if (!manifest.supportedModes.includes('random')) {
    throw new MatchmakingError('این بازی حالت رندوم را پشتیبانی نمی‌کند', 'MODE_NOT_SUPPORTED');
  }
  await assertCanAffordIfStaked(userId, type);

  if (userQueueKey.has(userId)) {
    throw new MatchmakingError('شما در حال حاضر در صف انتظار هستید', 'ALREADY_QUEUED');
  }

  const key = queueKey(gameId, type);
  if (!queues.has(key)) queues.set(key, []);
  const queue = queues.get(key);
  queue.push({ userId, joinedAt: Date.now() });
  userQueueKey.set(userId, key);

  const requiredPlayers = manifest.defaultRandomPlayers || manifest.minPlayers;
  if (queue.length < requiredPlayers) {
    return { status: 'queued', position: queue.length, required: requiredPlayers };
  }

  const chosen = queue.splice(0, requiredPlayers);
  for (const entry of chosen) userQueueKey.delete(entry.userId);

  try {
    const match = await createMatchFromPlayers({
      gameId,
      mode: 'random',
      type,
      playerUserIds: chosen.map((c) => c.userId),
    });
    // The caller whose request completed the group learns the matchId
    // synchronously (the return value below); everyone else who was
    // already waiting in the queue finds out via the notification poll.
    for (const entry of chosen) {
      if (entry.userId === userId) continue;
      pushNotification(entry.userId, { type: 'matched', matchId: match.id, gameId });
    }
    return { status: 'matched', matchId: match.id };
  } catch (err) {
    // Put back whichever players in the group were NOT the one who failed
    // the stake check, so they get re-matched quickly instead of waiting
    // out a brand new queue from scratch.
    if (err.code === 'INSUFFICIENT_FUNDS') {
      for (const entry of chosen) {
        if (entry.userId === err.userId) continue;
        queue.unshift(entry);
        userQueueKey.set(entry.userId, key);
      }
    }
    throw err;
  }
}

function leaveQueue(userId) {
  const key = userQueueKey.get(userId);
  if (!key) return false;
  const queue = queues.get(key) || [];
  const idx = queue.findIndex((e) => e.userId === userId);
  if (idx !== -1) queue.splice(idx, 1);
  userQueueKey.delete(userId);
  return true;
}

const FRIEND_REQUEST_TTL_MS = 60 * 1000;

/** Invites a specific friend to a match (spec section 9). */
async function sendFriendGameRequest(fromUserId, toUserId, gameId, type) {
  const { manifest } = registry.getGame(gameId);
  if (!manifest.supportedModes.includes('friend')) {
    throw new MatchmakingError('این بازی حالت با دوست را پشتیبانی نمی‌کند', 'MODE_NOT_SUPPORTED');
  }
  await assertCanAffordIfStaked(fromUserId, type);

  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: fromUserId, userBId: toUserId },
        { userAId: toUserId, userBId: fromUserId },
      ],
    },
  });
  if (!friendship) throw new MatchmakingError('این کاربر در لیست دوستان شما نیست', 'NOT_FRIENDS');

  const request = await prisma.gameRequest.create({
    data: {
      gameId,
      type,
      fromUserId,
      toUserId,
      status: 'pending',
      expiresAt: new Date(Date.now() + FRIEND_REQUEST_TTL_MS),
    },
  });
  return request;
}

async function respondToFriendGameRequest(requestId, toUserId, accept) {
  const request = await prisma.gameRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new MatchmakingError('درخواست پیدا نشد', 'NOT_FOUND');
  if (request.toUserId !== toUserId) throw new MatchmakingError('این درخواست برای شما نیست', 'FORBIDDEN');
  if (request.status !== 'pending') throw new MatchmakingError('این درخواست دیگر معتبر نیست', 'NOT_PENDING');
  if (request.expiresAt.getTime() < Date.now()) {
    await prisma.gameRequest.update({ where: { id: request.id }, data: { status: 'expired' } });
    throw new MatchmakingError('این درخواست منقضی شده است', 'EXPIRED');
  }

  if (!accept) {
    await prisma.gameRequest.update({ where: { id: request.id }, data: { status: 'rejected' } });
    return { status: 'rejected' };
  }

  await assertCanAffordIfStaked(request.fromUserId, request.type);
  await assertCanAffordIfStaked(request.toUserId, request.type);

  const match = await createMatchFromPlayers({
    gameId: request.gameId,
    mode: 'friend',
    type: request.type,
    playerUserIds: [request.fromUserId, request.toUserId],
  });

  await prisma.gameRequest.update({ where: { id: request.id }, data: { status: 'accepted', matchId: match.id } });
  return { status: 'accepted', matchId: match.id };
}

/** Called by a cron-style sweep (see index.js) to expire stale friend game requests. */
async function expireStaleGameRequests() {
  await prisma.gameRequest.updateMany({
    where: { status: 'pending', expiresAt: { lt: new Date() } },
    data: { status: 'expired' },
  });
}

module.exports = {
  MatchmakingError,
  joinRandomQueue,
  leaveQueue,
  drainNotifications,
  sendFriendGameRequest,
  respondToFriendGameRequest,
  expireStaleGameRequests,
  createMatchFromPlayers,
};

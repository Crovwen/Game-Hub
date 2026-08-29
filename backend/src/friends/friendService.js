'use strict';

const { prisma } = require('../db/prisma');
const logger = require('../utils/logger');

class FriendServiceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'FriendServiceError';
    this.code = code;
  }
}

/** Canonical ordering so a friendship between X and Y is always stored as (min,max) — never duplicated in either direction. */
function canonicalPair(userAId, userBId) {
  return userAId < userBId ? [userAId, userBId] : [userBId, userAId];
}

async function areFriends(userAId, userBId) {
  const [a, b] = canonicalPair(userAId, userBId);
  const existing = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
  return Boolean(existing);
}

/**
 * Sends a friend request. Rejects:
 *  - sending to yourself
 *  - a request when a friendship already exists
 *  - a duplicate *pending* request in either direction (spec section 8:
 *    "not allowed to send a duplicate request or duplicate friendship")
 * Prisma can't express "unique while status=pending" as a DB constraint
 * portably, so we enforce it here inside a transaction to close the race
 * window between the check and the insert.
 */
async function sendFriendRequest(senderId, receiverId) {
  if (senderId === receiverId) {
    throw new FriendServiceError('نمی‌توانید به خودتان درخواست دوستی بفرستید', 'SELF_REQUEST');
  }

  return prisma.$transaction(async (tx) => {
    if (await areFriends(senderId, receiverId)) {
      throw new FriendServiceError('شما قبلاً با این کاربر دوست هستید', 'ALREADY_FRIENDS');
    }

    const existingPending = await tx.friendRequest.findFirst({
      where: {
        status: 'pending',
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });
    if (existingPending) {
      throw new FriendServiceError('یک درخواست دوستی در حال انتظار از قبل وجود دارد', 'DUPLICATE_REQUEST');
    }

    const request = await tx.friendRequest.create({ data: { senderId, receiverId, status: 'pending' } });
    logger.events.friendRequest(senderId, receiverId, 'pending');
    return request;
  });
}

async function respondToFriendRequest(requestId, receiverId, accept) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new FriendServiceError('درخواست پیدا نشد', 'NOT_FOUND');
    if (request.receiverId !== receiverId) throw new FriendServiceError('این درخواست برای شما نیست', 'FORBIDDEN');
    if (request.status !== 'pending') throw new FriendServiceError('این درخواست قبلاً پاسخ داده شده', 'ALREADY_RESOLVED');

    const newStatus = accept ? 'accepted' : 'rejected';
    await tx.friendRequest.update({ where: { id: requestId }, data: { status: newStatus } });
    logger.events.friendRequest(request.senderId, request.receiverId, newStatus);

    if (accept) {
      const [userAId, userBId] = canonicalPair(request.senderId, request.receiverId);
      await tx.friendship.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId },
        update: {},
      });
    }

    return { status: newStatus, senderId: request.senderId, receiverId: request.receiverId };
  });
}

async function listFriends(userId) {
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: { userA: true, userB: true },
  });
  return friendships.map((f) => (f.userAId === userId ? f.userB : f.userA));
}

async function listPendingRequestsForUser(userId) {
  return prisma.friendRequest.findMany({
    where: { receiverId: userId, status: 'pending' },
    include: { sender: true },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  FriendServiceError,
  sendFriendRequest,
  respondToFriendRequest,
  listFriends,
  listPendingRequestsForUser,
  areFriends,
};

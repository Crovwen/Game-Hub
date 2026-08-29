'use strict';

const { MatchSession } = require('./MatchSession');
const { prisma } = require('../db/prisma');

// A single Render free-tier instance never scales horizontally, so a plain
// in-memory Map is the right amount of infrastructure here — no Redis
// required for this to be correct. REDIS_URL is reserved in .env.example
// for the day this needs to run on more than one instance (pub/sub to
// coordinate sessions across processes); the MatchSession API was kept
// framework-agnostic enough that swapping the storage layer later doesn't
// touch game logic at all.
const sessions = new Map();

async function getOrLoadSession(matchId) {
  if (sessions.has(matchId)) return sessions.get(matchId);

  const session = await MatchSession.load(matchId);
  session.onFinished = (id) => sessions.delete(id);
  sessions.set(matchId, session);
  await session.persistInitialStateIfNeeded();
  return session;
}

function getActiveSession(matchId) {
  return sessions.get(matchId) || null;
}

/** For a user reconnecting to the Mini App: do they have a match still in progress? */
async function findActiveMatchIdForUser(userId) {
  const matchPlayer = await prisma.matchPlayer.findFirst({
    where: { userId, match: { status: { in: ['ready', 'playing'] } } },
    orderBy: { joinedAt: 'desc' },
  });
  return matchPlayer ? matchPlayer.matchId : null;
}

module.exports = { getOrLoadSession, getActiveSession, findActiveMatchIdForUser };

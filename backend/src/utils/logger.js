'use strict';

// Deliberately tiny: structured JSON lines to stdout, which Render already
// captures and lets you search/filter. No external logging dependency.
// IMPORTANT: never pass BOT_TOKEN, JWT_SECRET, DATABASE_URL, or raw
// initData into `meta` — see README "Logging" section.

const REDACTED_KEYS = new Set(['token', 'bot_token', 'botToken', 'jwt', 'secret', 'password', 'initData', 'authorization']);

function sanitize(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    clean[key] = REDACTED_KEYS.has(key) ? '[redacted]' : value;
  }
  return clean;
}

function log(level, event, meta = {}) {
  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    ...sanitize(meta),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

module.exports = {
  info: (event, meta) => log('info', event, meta),
  warn: (event, meta) => log('warn', event, meta),
  error: (event, meta) => log('error', event, meta),
  // Convenience helpers for the specific events section 30 of the spec calls out.
  events: {
    userCreated: (userId) => log('info', 'user_created', { userId }),
    matchCreated: (matchId, gameId) => log('info', 'match_created', { matchId, gameId }),
    matchStarted: (matchId) => log('info', 'match_started', { matchId }),
    matchFinished: (matchId, winnerId) => log('info', 'match_finished', { matchId, winnerId }),
    friendRequest: (fromUserId, toUserId, status) => log('info', 'friend_request', { fromUserId, toUserId, status }),
    coinTransaction: (userId, amount, type) => log('info', 'coin_transaction', { userId, amount, type }),
    scoreTransaction: (userId, amount, type) => log('info', 'score_transaction', { userId, amount, type }),
  },
};

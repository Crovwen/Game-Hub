'use strict';

const express = require('express');
const cors = require('cors');
const http = require('http');

const { env, assertProductionEnv } = require('./config/env');
const logger = require('./utils/logger');
const registry = require('./games/registry');

const authRoutes = require('./api/routes/auth.routes');
const userRoutes = require('./api/routes/users.routes');
const friendRoutes = require('./api/routes/friends.routes');
const leaderboardRoutes = require('./api/routes/leaderboard.routes');
const gameRoutes = require('./api/routes/games.routes');
const matchRoutes = require('./api/routes/matches.routes');

const bot = require('./bot/bot');
const matchmaking = require('./matchmaking/matchmakingService');
const { attachWebSocketServer } = require('./realtime/wsServer');

assertProductionEnv();
registry.discoverGames(); // fail fast at boot if a game plugin is malformed

const app = express();
app.use(
  cors({
    // In production, only the deployed Mini App frontend may call this API.
    // In development WEBAPP_URL is usually empty, so we fall back to
    // allowing any origin to keep `npm run dev` friction-free.
    origin: env.WEBAPP_URL || true,
  }),
);
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/matches', matchRoutes);

// Telegram delivers updates here (webhook mode — see README "Render
// Deployment" and the architecture note in bot/bot.js about why this isn't
// long-polling in a background worker).
if (env.BOT_TOKEN) {
  app.post('/bot/webhook', bot.webhookMiddleware());
}

// Centralized error handler: never leak stack traces / internals (spec section 32).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('unhandled_error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'مشکلی پیش آمد. دوباره تلاش کن.' });
});

const server = http.createServer(app);
attachWebSocketServer(server);

const PORT = env.PORT;
server.listen(PORT, async () => {
  logger.info('server_started', { port: PORT, env: env.NODE_ENV });
  try {
    await bot.registerWebhook();
  } catch (err) {
    logger.error('bot_webhook_registration_failed', { error: err.message });
  }
});

// Sweep expired friend-game invites every 30s so a stale "waiting for your
// friend..." screen resolves on its own even if nobody polls it.
setInterval(() => {
  matchmaking.expireStaleGameRequests().catch((err) => logger.error('expire_sweep_failed', { error: err.message }));
}, 30 * 1000);

module.exports = { app, server };

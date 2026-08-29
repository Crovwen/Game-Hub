'use strict';

const express = require('express');
const cors = require('cors');
const http = require('http');

const { env, assertProductionEnv } = require('./config/env');
const logger = require('./utils/logger');
const registry = require('./games/registry');
const { prisma } = require('./db/prisma');

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
    origin: env.WEBAPP_URL || true,
  }),
);
app.use(express.json());

// Pinged by an external uptime monitor to stop Render's web service from
// spinning down. It also touches the database with a trivial query so a
// Postgres provider that auto-suspends on idle (e.g. Neon) stays warm too.
app.get('/health', async (req, res) => {
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbOk = false;
    logger.error('health_db_check_failed', { error: err.message });
  }
  res.json({ ok: true, db: dbOk, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/matches', matchRoutes);

if (env.BOT_TOKEN) {
  app.post('/bot/webhook', bot.webhookMiddleware());
}

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

setInterval(() => {
  matchmaking.expireStaleGameRequests().catch((err) => logger.error('expire_sweep_failed', { error: err.message }));
}, 30 * 1000);

module.exports = { app, server }; 

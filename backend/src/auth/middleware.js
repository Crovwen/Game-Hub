'use strict';

const { validateInitData } = require('./telegramAuth');
const jwt = require('./jwt');
const { env } = require('../config/env');
const { prisma } = require('../db/prisma');
const coinService = require('../economy/coinService');
const logger = require('../utils/logger');

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * POST /api/auth/telegram body: { initData }
 * Validates initData against BOT_TOKEN, upserts the User row, grants the
 * one-time initial coin balance, and returns a JWT the frontend stores in
 * memory (never localStorage — see frontend/src/services/api.js) for every
 * subsequent request and the WebSocket handshake.
 */
async function loginWithTelegram(req, res) {
  const { initData } = req.body || {};
  const result = validateInitData(initData, env.BOT_TOKEN);
  if (!result.valid) {
    return res.status(401).json({ error: result.error });
  }
  const tgUser = result.data.user;
  if (!tgUser || !tgUser.id) {
    return res.status(400).json({ error: 'کاربر تلگرام در initData یافت نشد' });
  }

  const telegramId = BigInt(tgUser.id);
  let user = await prisma.user.findUnique({ where: { telegramId } });
  let isNewUser = false;

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        username: tgUser.username || null,
        firstName: tgUser.first_name || 'کاربر',
        lastName: tgUser.last_name || null,
        photoUrl: tgUser.photo_url || null,
      },
    });
    isNewUser = true;
    logger.events.userCreated(user.id);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: tgUser.username || user.username,
        firstName: tgUser.first_name || user.firstName,
        lastName: tgUser.last_name || user.lastName,
        photoUrl: tgUser.photo_url || user.photoUrl,
      },
    });
  }

  if (isNewUser) {
    const grant = await coinService.grantInitialCoins(user.id);
    user.coins = grant.balanceAfter;
  }

  if (user.isBanned) {
    return res.status(403).json({ error: 'حساب شما مسدود شده است' });
  }

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresInSeconds: SESSION_TTL_SECONDS });
  return res.json({ token, user: serializeUser(user) });
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    coins: user.coins,
    score: user.score,
    wins: user.wins,
    losses: user.losses,
    gamesPlayed: user.gamesPlayed,
    role: user.role,
  };
}

/** Express middleware — requires `Authorization: Bearer <token>`. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'توکن احراز هویت یافت نشد' });
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'توکن نامعتبر یا منقضی شده است' });
  }
}

function requireAdmin(req, res, next) {
  prisma.user
    .findUnique({ where: { id: req.userId }, select: { role: true } })
    .then((user) => {
      if (!user || user.role !== 'admin') return res.status(403).json({ error: 'دسترسی غیرمجاز' });
      next();
    })
    .catch(next);
}

/** Used by the WebSocket upgrade handler, which has no Express req/res. */
function verifySessionToken(token) {
  return jwt.verify(token, env.JWT_SECRET); // throws if invalid/expired
}

module.exports = { loginWithTelegram, requireAuth, requireAdmin, verifySessionToken, serializeUser };

'use strict';

const express = require('express');
const { prisma } = require('../../db/prisma');
const { requireAuth } = require('../../auth/middleware');
const matchmaking = require('../../matchmaking/matchmakingService');
const sessionManager = require('../../realtime/sessionManager');
const registry = require('../../games/registry');
const bot = require('../../bot/bot');

const router = express.Router();
router.use(requireAuth);

router.get('/active', async (req, res) => {
  const matchId = await sessionManager.findActiveMatchIdForUser(req.userId);
  res.json({ matchId });
});

router.get('/notifications', (req, res) => {
  res.json(matchmaking.drainNotifications(req.userId));
});

router.post('/queue', async (req, res) => {
  const { gameId, type } = req.body || {};
  if (!gameId || !['free', 'staked'].includes(type)) {
    return res.status(400).json({ error: 'gameId و type (free|staked) الزامی است' });
  }
  try {
    const result = await matchmaking.joinRandomQueue(req.userId, gameId, type);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

router.delete('/queue', (req, res) => {
  matchmaking.leaveQueue(req.userId);
  res.json({ status: 'left' });
});

router.post('/friend-requests', async (req, res) => {
  const { toUserId, gameId, type } = req.body || {};
  if (!toUserId || !gameId || !['free', 'staked'].includes(type)) {
    return res.status(400).json({ error: 'toUserId، gameId و type الزامی است' });
  }
  try {
    const request = await matchmaking.sendFriendGameRequest(req.userId, toUserId, gameId, type);
    const fromUser = await prisma.user.findUnique({ where: { id: req.userId } });
    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
    const { manifest } = registry.getGame(gameId);
    await bot.notifyGameRequest(toUser.telegramId, fromUser, manifest, request.id);
    res.status(201).json({ id: request.id, status: request.status, expiresAt: request.expiresAt });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

router.get('/friend-requests', async (req, res) => {
  const incoming = await prisma.gameRequest.findMany({
    where: { toUserId: req.userId, status: 'pending' },
    include: { fromUser: true },
  });
  const outgoing = await prisma.gameRequest.findMany({
    where: { fromUserId: req.userId, status: 'pending' },
  });
  res.json({ incoming, outgoing });
});

router.post('/friend-requests/:id/respond', async (req, res) => {
  const { accept } = req.body || {};
  try {
    const result = await matchmaking.respondToFriendGameRequest(req.params.id, req.userId, Boolean(accept));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

router.get('/:id', async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id }, include: { players: true } });
  if (!match) return res.status(404).json({ error: 'بازی پیدا نشد' });
  const isPlayer = match.players.some((p) => p.userId === req.userId);
  if (!isPlayer) return res.status(403).json({ error: 'دسترسی غیرمجاز' });

  res.json({
    id: match.id,
    gameId: match.gameId,
    mode: match.mode,
    type: match.type,
    stake: match.stake,
    status: match.status,
    players: match.players.map((p) => ({ userId: p.userId, seat: p.seat, isConnected: p.isConnected })),
  });
});

module.exports = router;

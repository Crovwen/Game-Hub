'use strict';

const express = require('express');
const { prisma } = require('../../db/prisma');
const { requireAuth, serializeUser } = require('../../auth/middleware');
const friendService = require('../../friends/friendService');
const bot = require('../../bot/bot');

const router = express.Router();
router.use(requireAuth);

async function findUserByIdentifier(identifier) {
  if (/^\d+$/.test(String(identifier))) {
    const byTelegramId = await prisma.user.findUnique({ where: { telegramId: BigInt(identifier) } });
    if (byTelegramId) return byTelegramId;
  }
  return prisma.user.findUnique({ where: { id: identifier } });
}

router.get('/', async (req, res) => {
  const friends = await friendService.listFriends(req.userId);
  res.json(friends.map(serializeUser));
});

router.get('/requests', async (req, res) => {
  const requests = await friendService.listPendingRequestsForUser(req.userId);
  res.json(
    requests.map((r) => ({ id: r.id, sender: serializeUser(r.sender), createdAt: r.createdAt })),
  );
});

router.post('/requests', async (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) return res.status(400).json({ error: 'شناسه کاربر را وارد کنید' });

  const target = await findUserByIdentifier(identifier);
  if (!target) return res.status(404).json({ error: 'کاربری با این شناسه پیدا نشد' });

  try {
    const request = await friendService.sendFriendRequest(req.userId, target.id);
    const sender = await prisma.user.findUnique({ where: { id: req.userId } });
    await bot.notifyFriendRequest(target.telegramId, sender, request.id);
    res.status(201).json({ id: request.id, status: request.status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/requests/:id/respond', async (req, res) => {
  const { accept } = req.body || {};
  try {
    const result = await friendService.respondToFriendRequest(req.params.id, req.userId, Boolean(accept));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

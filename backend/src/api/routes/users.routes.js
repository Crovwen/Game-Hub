'use strict';

const express = require('express');
const { prisma } = require('../../db/prisma');
const { requireAuth, serializeUser } = require('../../auth/middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

  const rank = (await prisma.user.count({ where: { score: { gt: user.score } } })) + 1;
  res.json({ ...serializeUser(user), rank });
});

module.exports = router;

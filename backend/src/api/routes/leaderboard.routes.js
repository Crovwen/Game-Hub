'use strict';

const express = require('express');
const { prisma } = require('../../db/prisma');
const { requireAuth } = require('../../auth/middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const top = await prisma.user.findMany({
    where: { isBanned: false },
    orderBy: { score: 'desc' },
    take: limit,
    select: { id: true, firstName: true, lastName: true, username: true, photoUrl: true, score: true, coins: true },
  });
  res.json(top.map((u, idx) => ({ rank: idx + 1, ...u })));
});

module.exports = router;

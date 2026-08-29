'use strict';

const { PrismaClient } = require('@prisma/client');
const { env } = require('../config/env');

// A single shared instance — re-instantiating PrismaClient per request would
// exhaust Postgres connections almost immediately on Render's free plan.
const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = { prisma };

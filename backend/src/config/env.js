'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env against .env.example.`,
    );
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),

  // Required in production; in development we fall back so `npm run dev`
  // works before you've wired a real bot, but auth will simply reject
  // everything until BOT_TOKEN is set for real.
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',

  // WEBAPP_URL = the public URL of the FRONTEND (the Mini App the bot's
  // "Open" button launches) — e.g. https://your-frontend.onrender.com
  WEBAPP_URL: process.env.WEBAPP_URL || '',

  // BACKEND_URL = the public URL of THIS server, used only to register the
  // Telegram webhook at `${BACKEND_URL}/bot/webhook`. Render sets
  // RENDER_EXTERNAL_URL automatically for every web service, so you don't
  // need to set this by hand when deploying on Render — it's only here as
  // an explicit override for local tunnels (ngrok) or other hosts.
  BACKEND_URL: process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || '',

  REDIS_URL: process.env.REDIS_URL || '',

  INITIAL_COINS: Number(process.env.INITIAL_COINS || 1000),
};

function assertProductionEnv() {
  if (env.NODE_ENV !== 'production') return;
  required('BOT_TOKEN');
  required('DATABASE_URL');
  required('JWT_SECRET');
  required('WEBAPP_URL');
  required('BACKEND_URL');
}

module.exports = { env, assertProductionEnv };

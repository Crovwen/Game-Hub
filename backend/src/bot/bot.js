'use strict';

const { Bot, InlineKeyboard, webhookCallback } = require('grammy');
const { env } = require('../config/env');
const { prisma } = require('../db/prisma');
const friendService = require('../friends/friendService');
const matchmaking = require('../matchmaking/matchmakingService');
const logger = require('../utils/logger');

// Bot is created lazily so importing this module never crashes when
// BOT_TOKEN isn't set yet (e.g. running unit tests, or a fresh clone before
// .env is filled in).
let bot = null;

function getBot() {
  if (bot) return bot;
  if (!env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not set — cannot start the Telegram bot');
  }
  bot = new Bot(env.BOT_TOKEN);
  registerHandlers(bot);
  return bot;
}

function registerHandlers(botInstance) {
  botInstance.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard().webApp('🎮 باز کردن بازی', env.WEBAPP_URL);
    await ctx.reply(
      'به پلتفرم بازی خوش آمدید! 🎉\nبرای شروع، دکمه زیر را بزنید.',
      { reply_markup: keyboard },
    );
  });

  // Accept/Reject buttons on a friend request notification.
  botInstance.callbackQuery(/^friend_(accept|reject):(.+)$/, async (ctx) => {
    const [, action, requestId] = ctx.match;
    try {
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user) return ctx.answerCallbackQuery({ text: 'کاربر یافت نشد' });
      const result = await friendService.respondToFriendRequest(requestId, user.id, action === 'accept');
      await ctx.editMessageText(
        result.status === 'accepted' ? '✅ درخواست دوستی پذیرفته شد.' : '❌ درخواست دوستی رد شد.',
      );
      await ctx.answerCallbackQuery();
    } catch (err) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
    }
  });

  // Accept/Reject buttons on a friend GAME invite.
  botInstance.callbackQuery(/^game_(accept|reject):(.+)$/, async (ctx) => {
    const [, action, requestId] = ctx.match;
    try {
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user) return ctx.answerCallbackQuery({ text: 'کاربر یافت نشد' });
      const result = await matchmaking.respondToFriendGameRequest(requestId, user.id, action === 'accept');
      if (result.status === 'accepted') {
        const keyboard = new InlineKeyboard().webApp('▶️ ورود به بازی', env.WEBAPP_URL);
        await ctx.editMessageText('✅ درخواست بازی پذیرفته شد!', { reply_markup: keyboard });
      } else {
        await ctx.editMessageText('❌ درخواست بازی رد شد.');
      }
      await ctx.answerCallbackQuery();
    } catch (err) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
    }
  });

  botInstance.catch((err) => {
    logger.error('bot_error', { error: err.message });
  });
}

function displayName(user) {
  return user.username ? `@${user.username}` : user.firstName;
}

async function notifyFriendRequest(toTelegramId, fromUser, requestId) {
  if (!env.BOT_TOKEN) return; // allow the app to run without a bot in local dev
  const keyboard = new InlineKeyboard()
    .text('✅ قبول درخواست', `friend_accept:${requestId}`)
    .text('❌ رد درخواست', `friend_reject:${requestId}`);
  await getBot().api.sendMessage(
    toTelegramId.toString(),
    `👥 کاربر ${displayName(fromUser)} می‌خواهد با شما دوست شود.`,
    { reply_markup: keyboard },
  );
}

async function notifyGameRequest(toTelegramId, fromUser, gameManifest, requestId) {
  if (!env.BOT_TOKEN) return;
  const keyboard = new InlineKeyboard()
    .text('✅ قبول', `game_accept:${requestId}`)
    .text('❌ رد', `game_reject:${requestId}`);
  await getBot().api.sendMessage(
    toTelegramId.toString(),
    `${gameManifest.icon} کاربر ${displayName(fromUser)} شما را به یک بازی ${gameManifest.persianName} دعوت کرد.`,
    { reply_markup: keyboard },
  );
}

async function notifyMatchResult(toTelegramId, text) {
  if (!env.BOT_TOKEN) return;
  await getBot().api.sendMessage(toTelegramId.toString(), text);
}

/** Express middleware mounted at POST /bot/webhook — see index.js. */
function webhookMiddleware() {
  return webhookCallback(getBot(), 'express');
}

async function registerWebhook() {
  if (!env.BOT_TOKEN || !env.BACKEND_URL) {
    logger.warn('bot_webhook_not_registered', { reason: 'BOT_TOKEN or BACKEND_URL missing' });
    return;
  }
  const url = `${env.BACKEND_URL.replace(/\/$/, '')}/bot/webhook`;
  await getBot().api.setWebhook(url);
  logger.info('bot_webhook_registered', { url });
}

module.exports = {
  getBot,
  notifyFriendRequest,
  notifyGameRequest,
  notifyMatchResult,
  webhookMiddleware,
  registerWebhook,
};

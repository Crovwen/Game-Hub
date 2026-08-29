'use strict';

const { WebSocketServer } = require('ws');
const { verifySessionToken } = require('../auth/middleware');
const sessionManager = require('./sessionManager');
const { prisma } = require('../db/prisma');
const logger = require('../utils/logger');

/**
 * One WS connection = one browser tab. A user only ever needs to be
 * attached to at most one MatchSession at a time (the frontend connects
 * once it knows the matchId, from either a fresh match/queue response or
 * GET /api/matches/active on reconnect).
 *
 * Protocol (all messages are JSON):
 *   client -> server  { type: 'join', matchId }
 *   client -> server  { type: 'action', action: {...} }   // game-specific, validated by the engine
 *   server -> client  { type: 'state', matchId, gameId, state }
 *   server -> client  { type: 'presence', matchId, presence: [...] }
 *   server -> client  { type: 'action_rejected', error }
 *   server -> client  { type: 'match_finished', matchId, result }
 *   server -> client  { type: 'error', error }
 */
function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let userId = null;
    let currentMatchId = null;

    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const payload = verifySessionToken(token);
      userId = payload.userId;
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'توکن نامعتبر است' }));
      ws.close();
      return;
    }

    ws.on('message', async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return ws.send(JSON.stringify({ type: 'error', error: 'پیام نامعتبر' }));
      }

      try {
        if (message.type === 'join') {
          const matchPlayer = await prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: message.matchId, userId } },
          });
          if (!matchPlayer) {
            return ws.send(JSON.stringify({ type: 'error', error: 'شما در این بازی عضو نیستید' }));
          }
          currentMatchId = message.matchId;
          const session = await sessionManager.getOrLoadSession(currentMatchId);
          await session.attachSocket(userId, ws);
          return;
        }

        if (message.type === 'action') {
          if (!currentMatchId) return ws.send(JSON.stringify({ type: 'error', error: 'ابتدا باید به بازی متصل شوید' }));
          const session = sessionManager.getActiveSession(currentMatchId) || (await sessionManager.getOrLoadSession(currentMatchId));
          await session.handleAction(userId, message.action);
          return;
        }
      } catch (err) {
        logger.error('ws_message_error', { error: err.message, userId, matchId: currentMatchId });
        ws.send(JSON.stringify({ type: 'error', error: 'مشکلی پیش آمد. دوباره تلاش کن.' }));
      }
    });

    ws.on('close', async () => {
      if (currentMatchId && userId) {
        const session = sessionManager.getActiveSession(currentMatchId);
        if (session) await session.detachSocket(userId);
      }
    });
  });

  return wss;
}

module.exports = { attachWebSocketServer };

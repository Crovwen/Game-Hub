'use strict';

const crypto = require('crypto');

/**
 * Validates Telegram Mini App `initData`.
 *
 * We never trust a user id, name, or photo sent as plain JSON from the
 * frontend. The frontend only ever forwards the raw `initData` string that
 * Telegram itself signed (window.Telegram.WebApp.initData); everything the
 * backend knows about "who is calling" comes from re-deriving it here.
 *
 * Algorithm (Telegram's official spec for validating Mini App data):
 *   1. Parse initData as a query string, pull out `hash`, drop it from the set.
 *   2. Sort the remaining keys, build `data_check_string` as "key=value"
 *      lines joined with "\n".
 *   3. secret_key = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN)
 *   4. expected_hash = HMAC_SHA256(key=secret_key, message=data_check_string)
 *   5. expected_hash (hex) must equal the `hash` field, via constant-time compare.
 *   6. Reject if `auth_date` is older than maxAgeSeconds (replay protection —
 *      a leaked initData string should not be usable forever).
 *
 * @param {string} initDataRaw - the raw initData string from the client
 * @param {string} botToken
 * @param {{ maxAgeSeconds?: number }} [options]
 * @returns {{ valid: true, data: { user: object, authDate: number, [key:string]: any } } | { valid: false, error: string }}
 */
function validateInitData(initDataRaw, botToken, options = {}) {
  const maxAgeSeconds = options.maxAgeSeconds ?? 24 * 60 * 60; // 24h default

  if (!initDataRaw || typeof initDataRaw !== 'string') {
    return { valid: false, error: 'initData is missing' };
  }
  if (!botToken) {
    return { valid: false, error: 'server misconfiguration: BOT_TOKEN is not set' };
  }

  let params;
  try {
    params = new URLSearchParams(initDataRaw);
  } catch {
    return { valid: false, error: 'initData is not a valid query string' };
  }

  const hash = params.get('hash');
  if (!hash) return { valid: false, error: 'initData has no hash field' };

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push([key, value]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const providedBuf = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const hashesMatch =
    providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!hashesMatch) return { valid: false, error: 'invalid signature' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return { valid: false, error: 'missing auth_date' };
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds) return { valid: false, error: 'initData has expired' };
  if (ageSeconds < -60) return { valid: false, error: 'auth_date is in the future' };

  let user = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      return { valid: false, error: 'user field is not valid JSON' };
    }
  }

  const data = { authDate, user };
  for (const [k, v] of pairs) {
    if (k === 'user') continue;
    data[k] = v;
  }

  return { valid: true, data };
}

module.exports = { validateInitData };

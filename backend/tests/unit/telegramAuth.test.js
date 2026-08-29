'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { validateInitData } = require('../../src/auth/telegramAuth');

const BOT_TOKEN = '123456:FAKE-TEST-TOKEN-not-a-real-secret';

// Builds a correctly-signed initData string exactly the way Telegram does,
// so we can test our *validator* against a known-good fixture.
function buildInitData(fields, botToken = BOT_TOKEN) {
  const pairs = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

test('accepts correctly-signed, fresh initData', () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = buildInitData({
    auth_date: String(now),
    query_id: 'AAABBBCCC',
    user: JSON.stringify({ id: 12345, first_name: 'سارا', username: 'sara_tg' }),
  });
  const result = validateInitData(initData, BOT_TOKEN);
  assert.equal(result.valid, true);
  assert.equal(result.data.user.id, 12345);
  assert.equal(result.data.user.first_name, 'سارا');
});

test('rejects initData signed with a different bot token', () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = buildInitData(
    { auth_date: String(now), user: JSON.stringify({ id: 1, first_name: 'X' }) },
    'a-completely-different-token',
  );
  const result = validateInitData(initData, BOT_TOKEN);
  assert.equal(result.valid, false);
});

test('rejects a tampered field (e.g. swapped user id) even if hash format is intact', () => {
  const now = Math.floor(Date.now() / 1000);
  const initData = buildInitData({
    auth_date: String(now),
    user: JSON.stringify({ id: 12345, first_name: 'سارا' }),
  });
  const tampered = initData.replace('12345', '99999');
  const result = validateInitData(tampered, BOT_TOKEN);
  assert.equal(result.valid, false);
});

test('rejects expired initData', () => {
  const oldTimestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 48; // 48h old
  const initData = buildInitData({
    auth_date: String(oldTimestamp),
    user: JSON.stringify({ id: 1, first_name: 'X' }),
  });
  const result = validateInitData(initData, BOT_TOKEN, { maxAgeSeconds: 24 * 60 * 60 });
  assert.equal(result.valid, false);
  assert.match(result.error, /expired/);
});

test('rejects missing hash', () => {
  const result = validateInitData('auth_date=123&user=%7B%7D', BOT_TOKEN);
  assert.equal(result.valid, false);
});

test('rejects empty/missing initData', () => {
  assert.equal(validateInitData('', BOT_TOKEN).valid, false);
  assert.equal(validateInitData(null, BOT_TOKEN).valid, false);
});

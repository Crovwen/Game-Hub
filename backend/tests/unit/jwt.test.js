'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('../../src/auth/jwt');

test('sign then verify round-trips the payload', () => {
  const token = jwt.sign({ userId: 'u1', role: 'user' }, 'secret123');
  const payload = jwt.verify(token, 'secret123');
  assert.equal(payload.userId, 'u1');
  assert.equal(payload.role, 'user');
  assert.ok(payload.iat);
});

test('rejects a token signed with a different secret', () => {
  const token = jwt.sign({ userId: 'u1' }, 'secret123');
  assert.throws(() => jwt.verify(token, 'wrong-secret'));
});

test('rejects a tampered payload', () => {
  const token = jwt.sign({ userId: 'u1', role: 'user' }, 'secret123');
  const [h, p, s] = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'u1', role: 'admin' })).toString('base64url');
  assert.throws(() => jwt.verify(`${h}.${tamperedPayload}.${s}`, 'secret123'));
});

test('rejects an expired token', () => {
  const token = jwt.sign({ userId: 'u1' }, 'secret123', { expiresInSeconds: -10 });
  assert.throws(() => jwt.verify(token, 'secret123'));
});

test('rejects a malformed token', () => {
  assert.throws(() => jwt.verify('not-a-jwt', 'secret123'));
});

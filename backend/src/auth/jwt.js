'use strict';

const crypto = require('crypto');

/**
 * A deliberately tiny HS256 JWT implementation instead of pulling in the
 * `jsonwebtoken` package. The tokens we issue are short-lived, single-
 * purpose session tokens (not a general-purpose auth library use case), so
 * a ~60-line dependency-free implementation is easier to audit than an
 * external dependency and produces standard, interoperable JWTs — swap in
 * a library later with zero format changes if the project outgrows this.
 */

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function sign(payload, secret, { expiresInSeconds } = {}) {
  if (!secret) throw new Error('JWT secret is required');
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now };
  if (expiresInSeconds) fullPayload.exp = now + expiresInSeconds;

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verify(token, secret) {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('malformed token');
  }
  const [encodedHeader, encodedPayload, signature] = token.split('.');

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('invalid signature');
  }

  const payload = JSON.parse(base64urlDecode(encodedPayload).toString('utf8'));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('token expired');
  }
  return payload;
}

module.exports = { sign, verify };

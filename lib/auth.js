'use strict';

const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function authConfig() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!password || password.length < 16 || !secret || secret.length < 32) return null;
  return { password, secret };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function issueToken() {
  const config = authConfig();
  if (!config) throw new Error('ADMIN_AUTH_NOT_CONFIGURED');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }))
    .toString('base64url');
  return payload + '.' + sign(payload, config.secret);
}

function verifyToken(token) {
  const config = authConfig();
  if (!config || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !safeEqual(parts[1], sign(parts[0], config.secret))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

function tokenFromRequest(req) {
  const value = req.headers && req.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return '';
  return value.slice(7).trim();
}

function loginRateKey(req) {
  const config = authConfig();
  if (!config) return null;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
  const digest = crypto.createHmac('sha256', config.secret).update(ip).digest('hex').slice(0, 32);
  return 'amanter:admin:login:' + digest;
}

module.exports = {
  authConfig,
  safeEqual,
  issueToken,
  verifyToken,
  tokenFromRequest,
  loginRateKey,
  TOKEN_TTL_SECONDS
};

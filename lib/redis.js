'use strict';

const crypto = require('crypto');
const EVENTS_KEY = 'amanter:analytics:events:v1';
const MAX_EVENTS = 20000;
const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const RETENTION_MS = RETENTION_SECONDS * 1000;

function isConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('ANALYTICS_STORAGE_NOT_CONFIGURED');
  return { url: url.replace(/\/+$/, ''), token };
}

async function redisRequest(path, payload) {
  const { url, token } = getConfig();
  const response = await fetch(url + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  let result;
  try {
    result = await response.json();
  } catch (_) {
    throw new Error('ANALYTICS_STORAGE_UNAVAILABLE');
  }
  if (!response.ok || (result && result.error)) {
    throw new Error('ANALYTICS_STORAGE_UNAVAILABLE');
  }
  return result;
}

async function command(args) {
  const result = await redisRequest('', args);
  return result.result;
}

async function pipeline(commands) {
  const result = await redisRequest('/pipeline', commands);
  if (!Array.isArray(result)) throw new Error('ANALYTICS_STORAGE_UNAVAILABLE');
  const error = result.find(function (item) { return item && item.error; });
  if (error) throw new Error('ANALYTICS_STORAGE_UNAVAILABLE');
  return result.map(function (item) { return item.result; });
}

async function storeEvent(event) {
  const member = JSON.stringify(event);
  const cutoff = Date.now() - RETENTION_MS;
  await pipeline([
    ['ZADD', EVENTS_KEY, event.at, member],
    ['ZREMRANGEBYSCORE', EVENTS_KEY, 0, cutoff],
    ['ZREMRANGEBYRANK', EVENTS_KEY, 0, -MAX_EVENTS - 1],
    ['EXPIRE', EVENTS_KEY, RETENTION_SECONDS]
  ]);
}

async function getRecentEvents() {
  const values = await pipeline([
    ['ZREMRANGEBYSCORE', EVENTS_KEY, 0, Date.now() - RETENTION_MS],
    ['ZREVRANGE', EVENTS_KEY, 0, MAX_EVENTS - 1],
    ['ZCARD', EVENTS_KEY]
  ]);
  const members = Array.isArray(values[1]) ? values[1] : [];
  const events = members.map(function (value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }).filter(Boolean);
  return { events, storedCount: Number(values[2]) || events.length, limit: MAX_EVENTS };
}

async function loginFailureCount(key) {
  const value = await command(['INCR', key]);
  if (Number(value) === 1) await command(['EXPIRE', key, 900]);
  return Number(value) || 0;
}

async function clearLoginFailures(key) {
  await command(['DEL', key]);
}

async function allowAnalyticsEvent(req) {
  const secret = process.env.ADMIN_AUTH_SECRET || process.env.UPSTASH_REDIS_REST_TOKEN;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
  const digest = crypto.createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
  const minute = Math.floor(Date.now() / 60000);
  const key = 'amanter:analytics:rate:' + digest + ':' + minute;
  const count = await command(['INCR', key]);
  if (Number(count) === 1) await command(['EXPIRE', key, 120]);
  return Number(count) <= 300;
}

module.exports = {
  EVENTS_KEY,
  isConfigured,
  command,
  pipeline,
  storeEvent,
  getRecentEvents,
  loginFailureCount,
  clearLoginFailures,
  allowAnalyticsEvent
};

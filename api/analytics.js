'use strict';

const crypto = require('crypto');
const { verifyToken, tokenFromRequest } = require('../lib/auth');
const { isConfigured, storeEvent, getRecentEvents, allowAnalyticsEvent } = require('../lib/redis');

const ALLOWED_TYPES = new Set(['page_view', 'session_start', 'click', 'section_view', 'scroll_depth']);
const ALLOWED_DAYS = new Set([1, 7, 30, 90]);
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function clean(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function safePage(value) {
  const path = clean(value, 120);
  if (!path || path[0] !== '/' || path.startsWith('//')) return '/';
  return path.replace(/[?#].*$/, '').slice(0, 100) || '/';
}

function safeDestination(value) {
  const destination = clean(value, 140);
  if (!destination || destination[0] !== '/' || destination.startsWith('//')) return '/';
  const withoutQuery = destination.replace(/\?.*$/, '');
  return /^\/[A-Za-z0-9._~/-]{0,90}(?:#[A-Za-z0-9_-]{1,40})?$/.test(withoutQuery) ? withoutQuery : '/';
}

function validSession(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(value);
}

function sanitizeEvent(body) {
  if (!body || typeof body !== 'object' || !ALLOWED_TYPES.has(body.type) || !validSession(body.session)) return null;
  const event = {
    id: crypto.randomUUID(),
    at: Date.now(),
    type: body.type,
    session: body.session,
    page: safePage(body.page),
    device: ['mobile', 'tablet', 'desktop'].includes(body.device) ? body.device : 'unknown'
  };

  if (body.type === 'session_start') {
    event.source = clean(body.source, 80) || 'direct';
    event.campaignSource = clean(body.campaignSource, 80);
    event.campaignMedium = clean(body.campaignMedium, 80);
    event.campaignName = clean(body.campaignName, 80);
  }
  if (body.type === 'click') {
    event.label = clean(body.label, 100) || 'Элемент без подписи';
    event.target = ['whatsapp', 'phone', 'telegram', 'instagram', 'external', 'internal', 'button'].includes(body.target)
      ? body.target : 'button';
    event.destination = safeDestination(body.destination || '/');
  }
  if (body.type === 'section_view') event.section = clean(body.section, 60);
  if (body.type === 'scroll_depth') {
    const depth = Number(body.depth);
    if (![25, 50, 75, 100].includes(depth)) return null;
    event.depth = depth;
  }
  return event;
}

function aggregate(events, days) {
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;
  const inRange = events.filter(function (event) { return Number(event.at) >= start && Number(event.at) <= now; });
  const sessions = new Set();
  const pages = new Map();
  const actions = new Map();
  const destinations = new Map();
  const sources = new Map();
  const devices = new Map();
  const sections = new Map();
  const timeline = new Map();
  let pageViews = 0;
  let clicks = 0;
  let contacts = 0;
  let scrollEvents = 0;

  function increment(map, key) {
    const safeKey = key || 'не указано';
    map.set(safeKey, (map.get(safeKey) || 0) + 1);
  }

  inRange.forEach(function (event) {
    if (event.session) sessions.add(event.session);
    const date = new Date(Number(event.at)).toISOString().slice(0, 10);
    const bucket = timeline.get(date) || { date, pageViews: 0, clicks: 0, sessions: 0 };
    if (event.type === 'page_view') {
      pageViews += 1;
      increment(pages, event.page);
      bucket.pageViews += 1;
    } else if (event.type === 'session_start') {
      const sourceLabel = event.campaignSource || event.source || 'direct';
      const attribution = [sourceLabel, event.campaignMedium, event.campaignName].filter(Boolean).join(' · ');
      increment(sources, attribution);
      increment(devices, event.device || 'unknown');
      bucket.sessions += 1;
    } else if (event.type === 'click') {
      clicks += 1;
      const action = event.label + (event.target && event.target !== 'button' ? ' · ' + event.target : '');
      increment(actions, action);
      increment(destinations, event.destination || '/');
      bucket.clicks += 1;
      if (event.target === 'whatsapp' || event.target === 'phone') contacts += 1;
    } else if (event.type === 'section_view') {
      increment(sections, event.section || event.page);
    } else if (event.type === 'scroll_depth') {
      scrollEvents += 1;
    }
    timeline.set(date, bucket);
  });

  function ranked(map, limit) {
    return Array.from(map.entries())
      .map(function (entry) { return { name: entry[0], count: entry[1] }; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'ru'); })
      .slice(0, limit);
  }

  const daysCount = Math.max(1, Math.min(days, 90));
  const timelineRows = [];
  for (let offset = daysCount; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    timelineRows.push(timeline.get(date) || { date, pageViews: 0, clicks: 0, sessions: 0 });
  }

  return {
    summary: {
      sessions: sessions.size,
      pageViews,
      clicks,
      contactClicks: contacts,
      sectionViews: Array.from(sections.values()).reduce(function (a, b) { return a + b; }, 0),
      scrollEvents
    },
    timeline: timelineRows,
    topPages: ranked(pages, 8),
    topActions: ranked(actions, 10),
    topDestinations: ranked(destinations, 10),
    sources: ranked(sources, 8),
    devices: ranked(devices, 4),
    sections: ranked(sections, 8),
    recent: inRange.slice(0, 50).map(function (event) {
      return {
        at: event.at,
        type: event.type,
        page: event.page,
        label: event.label || event.section || (event.depth ? event.depth + '%' : ''),
        target: event.target || '',
        source: event.source || ''
      };
    })
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(res, 204, {});

  if (req.method === 'POST') {
    if (!isConfigured()) {
      return reply(res, 503, { error: 'Сбор статистики ещё не настроен.' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const event = sanitizeEvent(body);
    if (!event) return reply(res, 400, { error: 'Некорректное событие.' });
    try {
      if (!await allowAnalyticsEvent(req)) return reply(res, 429, { error: 'Превышен лимит событий. Повторите позже.' });
      await storeEvent(event);
      return reply(res, 202, { accepted: true });
    } catch (_) {
      return reply(res, 503, { error: 'Хранилище статистики временно недоступно.' });
    }
  }

  if (req.method === 'GET') {
    if (!verifyToken(tokenFromRequest(req))) return reply(res, 401, { error: 'Сессия администратора истекла.' });
    if (!isConfigured()) return reply(res, 503, { error: 'Добавьте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN в Vercel.' });
    const requestedDays = Number(req.query && req.query.days);
    const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 7;
    try {
      const result = await getRecentEvents();
      const cutoff = Date.now() - RETENTION_MS;
      const retained = result.events.filter(function (event) { return Number(event.at) >= cutoff; });
      return reply(res, 200, Object.assign(aggregate(retained, days), {
        rangeDays: days,
        storedEvents: result.storedCount,
        maxStoredEvents: result.limit,
        retentionDays: 90,
        limited: result.storedCount >= result.limit
      }));
    } catch (_) {
      return reply(res, 503, { error: 'Не удалось прочитать статистику. Проверьте подключение Upstash Redis.' });
    }
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return reply(res, 405, { error: 'Метод не поддерживается.' });
};

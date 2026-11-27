'use strict';

const {
  authConfig,
  safeEqual,
  issueToken,
  loginRateKey,
  TOKEN_TTL_SECONDS
} = require('../../lib/auth');
const { isConfigured, loginFailureCount, clearLoginFailures } = require('../../lib/redis');

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Метод не поддерживается.' });
  }

  const config = authConfig();
  if (!config) {
    return reply(res, 503, { error: 'Администратор ещё не настроен. Задайте ADMIN_PASSWORD (не короче 16 символов) и ADMIN_AUTH_SECRET в переменных Vercel.' });
  }
  if (!isConfigured()) {
    return reply(res, 503, { error: 'Не настроено хранилище статистики. Добавьте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN в Vercel.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const password = typeof body.password === 'string' ? body.password : '';
  if (!safeEqual(password, config.password)) {
    try {
      const count = await loginFailureCount(loginRateKey(req));
      if (count > 10) return reply(res, 429, { error: 'Слишком много попыток. Повторите через 15 минут.' });
    } catch (_) {
      return reply(res, 503, { error: 'Временно недоступна проверка входа. Попробуйте позже.' });
    }
    return reply(res, 401, { error: 'Неверный пароль.' });
  }

  try {
    await clearLoginFailures(loginRateKey(req));
    const token = issueToken();
    return reply(res, 200, { token, expiresIn: TOKEN_TTL_SECONDS });
  } catch (_) {
    return reply(res, 503, { error: 'Временно недоступно хранилище. Попробуйте позже.' });
  }
};

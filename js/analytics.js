/* AMANTER — first-party, anonymous session analytics. No cookies or full IP storage. */
(function () {
  'use strict';

  var ENDPOINT = '/api/analytics';
  var SESSION_KEY = 'amanter_analytics_session';
  var STARTED_KEY = 'amanter_analytics_started';
  var SCROLL_KEY = 'amanter_analytics_scroll';
  var SECTION_KEY = 'amanter_analytics_sections';

  function storageGet(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 20);
  }

  var sessionId = storageGet(SESSION_KEY) || makeId();
  storageSet(SESSION_KEY, sessionId);

  function deviceType() {
    var width = window.innerWidth || 1024;
    return width < 600 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
  }

  function pageName() {
    return (window.location.pathname || '/').replace(/\/{2,}/g, '/').slice(0, 90) + (window.location.hash || '').slice(0, 40);
  }

  function send(type, extra) {
    var event = Object.assign({ type: type, session: sessionId, page: pageName(), device: deviceType() }, extra || {});
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () {});
    } catch (_) {}
  }

  if (!storageGet(STARTED_KEY)) {
    storageSet(STARTED_KEY, '1');
    var source = 'direct';
    try {
      if (document.referrer) {
        var referrerHost = new URL(document.referrer).hostname.toLowerCase();
        if (referrerHost && referrerHost !== window.location.hostname.toLowerCase()) source = referrerHost.slice(0, 80);
      }
    } catch (_) {}
    var params = new URLSearchParams(window.location.search);
    var campaignSource = (params.get('utm_source') || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
    var campaignMedium = (params.get('utm_medium') || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
    var campaignName = (params.get('utm_campaign') || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
    send('session_start', { source: source, campaignSource: campaignSource, campaignMedium: campaignMedium, campaignName: campaignName });
  }
  send('page_view');

  function clickTarget(href, isButton) {
    if (!href) return isButton ? 'button' : 'internal';
    var normalized = String(href).trim().toLowerCase();
    if (normalized.indexOf('https://wa.me/') === 0 || normalized.indexOf('https://api.whatsapp.com/') === 0 || normalized.indexOf('whatsapp:') === 0) return 'whatsapp';
    if (normalized.indexOf('tel:') === 0) return 'phone';
    if (normalized.indexOf('telegram.me/') >= 0 || normalized.indexOf('t.me/') >= 0) return 'telegram';
    if (normalized.indexOf('instagram.com/') >= 0) return 'instagram';
    if (normalized.charAt(0) === '#' || normalized.charAt(0) === '/') return 'internal';
    try {
      return new URL(normalized, window.location.href).origin === window.location.origin ? 'internal' : 'external';
    } catch (_) {
      return isButton ? 'button' : 'internal';
    }
  }

  function clickDestination(href) {
    if (!href) return '/';
    try {
      var parsed = new URL(href, window.location.href);
      if (parsed.origin !== window.location.origin) return '/' + parsed.hostname.toLowerCase().slice(0, 80);
      return (parsed.pathname || '/') + (parsed.hash || '');
    } catch (_) {
      return String(href).replace(/[?#].*$/, '').slice(0, 100) || '/';
    }
  }

  document.addEventListener('click', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('a,button,[role="button"]') : null;
    if (!node || node.closest('#panel, #loginScreen')) return;
    var href = node.getAttribute('href') || '';
    var label = node.getAttribute('aria-label') || node.getAttribute('title') || (node.textContent || '');
    label = label.replace(/\s+/g, ' ').trim().slice(0, 100) || node.tagName.toLowerCase();
    send('click', {
      label: label,
      target: clickTarget(href, node.tagName.toLowerCase() !== 'a'),
      destination: clickDestination(href)
    });
  }, true);

  var observed = Object.create(null);
  try {
    observed = JSON.parse(storageGet(SECTION_KEY) || '{}') || Object.create(null);
  } catch (_) {}

  if ('IntersectionObserver' in window) {
    var sections = document.querySelectorAll('main section[id], footer[id]');
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        if (!id || observed[id]) return;
        observed[id] = true;
        storageSet(SECTION_KEY, JSON.stringify(observed));
        send('section_view', { section: id });
      });
    }, { threshold: 0.35 });
    Array.prototype.forEach.call(sections, function (section) { sectionObserver.observe(section); });
  }

  var lastScrollAt = 0;
  window.addEventListener('scroll', function () {
    var now = Date.now();
    if (now - lastScrollAt < 500) return;
    lastScrollAt = now;
    var maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var depth = Math.min(100, Math.floor((window.scrollY / maxScroll) * 100));
    [25, 50, 75, 100].forEach(function (threshold) {
      if (depth >= threshold && !storageGet(SCROLL_KEY + '_' + threshold)) {
        storageSet(SCROLL_KEY + '_' + threshold, '1');
        send('scroll_depth', { depth: threshold });
      }
    });
  }, { passive: true });
})();

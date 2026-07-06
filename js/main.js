/* AMANTER — авто-интро с видео и звуком, каталоги из данных,
   заказ через WhatsApp, лепестки, слайдер, scroll-reveal */

(function () {
  'use strict';

  var Store = window.AmanterStore;

  /* ── Интро: видео запускается сразу ──────────────── */
  var intro = document.getElementById('intro');
  var introVideo = document.getElementById('introVideo');
  var introSound = document.getElementById('introSound');
  var introSkip = document.getElementById('introSkip');
  var introFinished = false;

  function finishIntro() {
    if (introFinished) return;
    introFinished = true;
    try { introVideo.pause(); } catch (e) {}
    intro.classList.add('is-hidden');
    document.body.classList.remove('no-scroll');
    setTimeout(function () { intro.remove(); }, 1300);
  }

  function tryUnmute() {
    introVideo.muted = false;
    introVideo.volume = 1;
    var p = introVideo.play();
    if (p && p.then) {
      p.then(function () {
        soundOn = true;
        introSound.hidden = true;
      }).catch(function () { /* звук всё ещё заблокирован */ });
    }
  }

  // Максимально настойчиво пытаемся играть со звуком сразу:
  // несколько попыток подряд + попытка при готовности видео.
  // Если браузер всё же запретил — играем без звука, показываем кнопку,
  // и первый же клик/тап/скролл мгновенно включает звук.
  var soundOn = false;
  var soundTries = 0;

  function attemptSound() {
    if (soundOn || introFinished) return;
    introVideo.muted = false;
    introVideo.volume = 1;
    var p = introVideo.play();
    if (p && p.then) {
      p.then(function () {
        soundOn = true;
        introSound.hidden = true;
      }).catch(function () {
        // запрещено — играем пока без звука
        introVideo.muted = true;
        introVideo.play().catch(function () {});
        introSound.hidden = false;
        if (++soundTries < 8) setTimeout(attemptSound, 600);
      });
    }
  }

  attemptSound();
  introVideo.addEventListener('loadeddata', attemptSound);

  var unlock = function () {
    if (!soundOn) tryUnmute();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('scroll', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchstart', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('scroll', unlock);

  introSound.addEventListener('click', function (e) {
    e.stopPropagation();
    tryUnmute();
  });
  introVideo.addEventListener('ended', finishIntro);
  introVideo.addEventListener('error', finishIntro);
  introSkip.addEventListener('click', function (e) {
    e.stopPropagation();
    finishIntro();
  });

  // подстраховка: если видео не смогло стартовать за 6 секунд — пропускаем интро
  setTimeout(function () {
    if (!introFinished && introVideo.readyState < 2 && introVideo.currentTime === 0) {
      finishIntro();
    }
  }, 6000);

  /* ── Каталоги из данных (редактируются в /admin) ─── */
  var products = Store.load();

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHtml(p, cream, delay) {
    return '' +
      '<article class="card' + (cream ? ' card--cream' : '') + ' reveal' + (delay ? ' reveal-delay-' + delay : '') + '">' +
        '<span class="card__tag' + (cream ? ' card__tag--gold' : '') + '">' + escapeHtml(p.tag) + '</span>' +
        '<div class="card__photo"><img src="' + escapeHtml(p.img) + '" alt="' + escapeHtml(p.name) + '" loading="lazy"></div>' +
        '<div class="card__body">' +
          '<h3 class="card__name">' + escapeHtml(p.name) + '</h3>' +
          '<p class="card__desc">' + escapeHtml(p.desc) + '</p>' +
          '<div class="card__row">' +
            '<span class="card__price">' + Store.formatPrice(p.price) + '</span>' +
            '<a class="btn btn--cart" href="' + Store.whatsappLink(p) + '" target="_blank" rel="noopener">' +
              '<svg viewBox="0 0 64 64" class="btn-paw-icon"><use href="#paw-shape"/></svg>В корзину</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function slideHtml(p) {
    return '' +
      '<article class="slide">' +
        '<div class="slide__photo"><img src="' + escapeHtml(p.img) + '" alt="' + escapeHtml(p.name) + '" loading="lazy"></div>' +
        '<div class="slide__body">' +
          '<h3 class="slide__name">' + escapeHtml(p.name) + '</h3>' +
          '<p class="slide__desc">' + escapeHtml(p.desc) + '</p>' +
          '<div class="slide__row">' +
            '<span class="slide__price">' + Store.formatPrice(p.price) + '</span>' +
            '<a class="btn btn--primary btn--small" href="' + Store.whatsappLink(p) + '" target="_blank" rel="noopener">' +
              '<svg viewBox="0 0 64 64" class="btn-paw-icon"><use href="#paw-shape"/></svg>Заказать</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  var flowersGrid = document.getElementById('flowersGrid');
  var sweetsGrid = document.getElementById('sweetsGrid');
  var sliderTrack = document.getElementById('sliderTrack');

  products.filter(function (p) { return p.section === 'flowers'; }).forEach(function (p, i) {
    flowersGrid.appendChild(el(cardHtml(p, false, Math.min(i, 3))));
  });
  products.filter(function (p) { return p.section === 'sweets'; }).forEach(function (p, i) {
    sweetsGrid.appendChild(el(cardHtml(p, true, Math.min(i, 3))));
  });
  products.filter(function (p) { return p.section === 'sets'; }).forEach(function (p) {
    sliderTrack.appendChild(el(slideHtml(p)));
  });

  /* ── Instagram-галерея из данных (управляется в /admin) ── */
  var instaGrid = document.getElementById('instaGrid');
  Store.loadGallery().forEach(function (ph) {
    instaGrid.appendChild(el(
      '<a class="insta__item" href="https://instagram.com/amanter_ing" target="_blank" rel="noopener">' +
        '<img src="' + escapeHtml(ph.img) + '" alt="' + escapeHtml(ph.alt || 'Работа AMANTER') + '" loading="lazy">' +
        '<span class="insta__hover">♥</span>' +
      '</a>'
    ));
  });

  /* ── Боковое меню ────────────────────────────────── */
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');
  var drawerOverlay = document.getElementById('drawerOverlay');
  var drawerClose = document.getElementById('drawerClose');

  function openDrawer() {
    drawer.classList.add('is-open');
    drawerOverlay.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawerOverlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  }

  burger.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);
  drawer.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', closeDrawer);
  });

  /* ── Навигация: фон при скролле ──────────────────── */
  var nav = document.getElementById('nav');
  function onScroll() { nav.classList.toggle('is-scrolled', window.scrollY > 60); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Падающие лепестки на hero ───────────────────── */
  var petalsBox = document.getElementById('petals');
  var PETAL_COLORS = [
    'rgba(242, 196, 206, .9)',
    'rgba(232, 158, 175, .85)',
    'rgba(255, 250, 248, .8)',
    'rgba(201, 168, 76, .55)',
    'rgba(166, 40, 65, .7)'
  ];

  var PETAL_COUNT = window.matchMedia('(max-width: 820px)').matches ? 16 : 30;

  for (var i = 0; i < PETAL_COUNT; i++) {
    var petal = document.createElement('span');
    petal.className = 'petal';
    var size = 8 + Math.random() * 14;
    petal.style.width = size + 'px';
    petal.style.height = size * (0.65 + Math.random() * 0.35) + 'px';
    petal.style.left = Math.random() * 100 + '%';
    petal.style.background = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
    petal.style.setProperty('--petal-drift', (Math.random() * 180 - 60) + 'px');
    petal.style.setProperty('--petal-spin', (200 + Math.random() * 420) + 'deg');
    petal.style.setProperty('--petal-opacity', (0.55 + Math.random() * 0.4).toFixed(2));
    petal.style.animationDuration = (9 + Math.random() * 11) + 's';
    petal.style.animationDelay = (Math.random() * -20) + 's';
    petalsBox.appendChild(petal);
  }

  /* ── Плавное появление секций при скролле ────────── */
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(function (n) { observer.observe(n); });

  /* ── Слайдер подарочных наборов ──────────────────── */
  var track = sliderTrack;
  var prevBtn = document.getElementById('sliderPrev');
  var nextBtn = document.getElementById('sliderNext');
  var dotsBox = document.getElementById('sliderDots');
  var slides = Array.prototype.slice.call(track.children);

  slides.forEach(function (_, idx) {
    var dot = document.createElement('button');
    dot.className = 'slider__dot' + (idx === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', 'Набор ' + (idx + 1));
    dot.addEventListener('click', function () { scrollToSlide(idx); });
    dotsBox.appendChild(dot);
  });

  var dots = Array.prototype.slice.call(dotsBox.children);

  function currentIndex() {
    var center = track.scrollLeft + track.clientWidth / 2;
    var best = 0, bestDist = Infinity;
    slides.forEach(function (s, idx) {
      var d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - center);
      if (d < bestDist) { bestDist = d; best = idx; }
    });
    return best;
  }

  function scrollToSlide(idx) {
    var s = slides[Math.max(0, Math.min(slides.length - 1, idx))];
    if (!s) return;
    track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2, behavior: 'smooth' });
  }

  prevBtn.addEventListener('click', function () { scrollToSlide(currentIndex() - 1); });
  nextBtn.addEventListener('click', function () { scrollToSlide(currentIndex() + 1); });

  var scrollTimer;
  track.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      var idx = currentIndex();
      dots.forEach(function (d, i2) { d.classList.toggle('is-active', i2 === idx); });
    }, 80);
  }, { passive: true });
})();

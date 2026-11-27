/* AMANTER — логика админ-панели: серверная авторизация,
   товары + фотогалерея (localStorage) и статистика сайта. */

(function () {
  'use strict';

  var Store = window.AmanterStore;
  var AUTH_KEY = 'amanter_admin_token';

  /* ── Вход ── */
  var loginScreen = document.getElementById('loginScreen');
  var loginForm = document.getElementById('loginForm');
  var passwordInput = document.getElementById('passwordInput');
  var loginError = document.getElementById('loginError');
  var panel = document.getElementById('panel');
  var logoutBtn = document.getElementById('logoutBtn');

  function showPanel() {
    loginScreen.hidden = true;
    panel.hidden = false;
    render();
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    loginError.hidden = true;
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value }),
      credentials: 'same-origin'
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Не удалось войти. Проверьте настройки сервера.');
        if (!data.token) throw new Error('Сервер не вернул токен входа.');
        return data;
      });
    }).then(function (data) {
      sessionStorage.setItem(AUTH_KEY, data.token);
      passwordInput.value = '';
      showPanel();
    }).catch(function (error) {
      loginError.textContent = error.message || 'Не удалось выполнить вход. Проверьте подключение.';
      loginError.hidden = false;
      passwordInput.value = '';
      passwordInput.focus();
    }).finally(function () {
      submitButton.disabled = false;
    });
  });

  logoutBtn.addEventListener('click', function () {
    sessionStorage.removeItem(AUTH_KEY);
    location.reload();
  });

  /* ── Состояние ── */
  var products = Store.load();
  var gallery = Store.loadGallery();
  var activeSection = 'flowers';
  var editingId = null;

  var productList = document.getElementById('productList');
  var savedNote = document.getElementById('savedNote');
  var addBtn = document.getElementById('addBtn');
  var galleryFile = document.getElementById('galleryFile');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  var SECTION_NAMES = { flowers: 'Цветы', sweets: 'Сладости', sets: 'Наборы', gallery: 'Галерея' };
  var toolbar = document.querySelector('.panel__toolbar');
  var statsView = document.getElementById('statsView');
  var statsStatus = document.getElementById('statsStatus');
  var statsRange = document.getElementById('statsRange');
  var statsKpis = document.getElementById('statsKpis');
  var statsTimeline = document.getElementById('statsTimeline');
  var statsPages = document.getElementById('statsPages');
  var statsActions = document.getElementById('statsActions');
  var statsDestinations = document.getElementById('statsDestinations');
  var statsSources = document.getElementById('statsSources');
  var statsDevices = document.getElementById('statsDevices');
  var statsSections = document.getElementById('statsSections');
  var statsRecent = document.getElementById('statsRecent');
  var lastStats = null;

  function persist() {
    Store.save(products);
    Store.saveGallery(gallery);
    savedNote.hidden = false;
    clearTimeout(persist._t);
    persist._t = setTimeout(function () { savedNote.hidden = true; }, 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // пути вида "assets/..." относительны корню сайта; используем абсолютный путь от корня
  function resolveImg(src) {
    if (!src) return '';
    if (src.indexOf('data:') === 0 || src.indexOf('http') === 0 || src.indexOf('/') === 0) return src;
    return '/' + src;
  }

  /* ── Список ── */
  function render() {
    addBtn.textContent = activeSection === 'gallery' ? '+ Добавить фото' : '+ Добавить товар';
    if (activeSection === 'stats') {
      toolbar.hidden = true;
      productList.hidden = true;
      statsView.hidden = false;
      loadStats();
      return;
    }
    toolbar.hidden = false;
    productList.hidden = false;
    statsView.hidden = true;
    productList.innerHTML = '';

    if (activeSection === 'gallery') {
      renderGallery();
      return;
    }

    var items = products.filter(function (p) { return p.section === activeSection; });

    if (!items.length) {
      productList.innerHTML = '<p style="color:#8A6670">В разделе «' + SECTION_NAMES[activeSection] + '» пока нет товаров. Нажмите «Добавить товар».</p>';
      return;
    }

    items.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'pitem';
      row.innerHTML =
        '<img class="pitem__img" src="' + escapeHtml(resolveImg(p.img)) + '" alt="">' +
        '<div class="pitem__info">' +
          '<span class="tagline">' + escapeHtml(p.tag) + '</span>' +
          '<h3>' + escapeHtml(p.name) + '</h3>' +
          '<p>' + escapeHtml(p.desc) + '</p>' +
          '<div class="price">' + Store.formatPrice(p.price) + '</div>' +
        '</div>' +
        '<div class="pitem__btns">' +
          '<button class="pbtn pbtn--ghost" data-act="edit" type="button">Изменить</button>' +
          '<button class="pbtn pbtn--danger" data-act="del" type="button">Удалить</button>' +
        '</div>';

      row.querySelector('[data-act="edit"]').addEventListener('click', function () { openModal(p.id); });
      row.querySelector('[data-act="del"]').addEventListener('click', function () {
        if (confirm('Удалить товар ' + p.name + '?')) {
          products = products.filter(function (x) { return x.id !== p.id; });
          persist();
          render();
        }
      });

      productList.appendChild(row);
    });
  }

  /* ── Галерея «Наши работы» ── */
  function renderGallery() {
    if (!gallery.length) {
      productList.innerHTML = '<p style="color:#8A6670">В галерее нет фото. Нажмите «Добавить фото».</p>';
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'ggrid';

    gallery.forEach(function (ph) {
      var cell = document.createElement('div');
      cell.className = 'gcell';
      cell.innerHTML =
        '<img src="' + escapeHtml(resolveImg(ph.img)) + '" alt="">' +
        '<button class="gcell__del" type="button" title="Удалить фото">✕</button>';

      cell.querySelector('.gcell__del').addEventListener('click', function () {
        if (confirm('Удалить это фото из галереи на сайте?')) {
          gallery = gallery.filter(function (x) { return x.id !== ph.id; });
          persist();
          render();
        }
      });

      grid.appendChild(cell);
    });

    productList.appendChild(grid);
  }

  /* ── Статистика ── */
  var statsFootnote = document.getElementById('statsFootnote');
  var statsRequestId = 0;

  function formatCount(value) {
    return Number(value || 0).toLocaleString('ru-RU');
  }

  function renderRanking(target, entries, emptyText) {
    if (!entries || !entries.length) {
      target.innerHTML = '<p class="stats__empty">' + escapeHtml(emptyText || 'Пока нет данных за этот период.') + '</p>';
      return;
    }
    target.innerHTML = '<ol class="stats__rank">' + entries.map(function (entry) {
      return '<li><span>' + escapeHtml(entry.name) + '</span><strong>' + formatCount(entry.count) + '</strong></li>';
    }).join('') + '</ol>';
  }

  function formatEventTime(value) {
    var date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function renderStats(data) {
    lastStats = data;
    var summary = data.summary || {};
    var cards = [
      ['Сеансы', summary.sessions, 'Сеансы в выбранном периоде'],
      ['Просмотры', summary.pageViews, 'Загрузки сайта'],
      ['Клики', summary.clicks, 'Ссылки и кнопки'],
      ['Контактные клики', summary.contactClicks, 'WhatsApp и телефон'],
      ['Просмотры разделов', summary.sectionViews, 'Разделы, попавшие в экран'],
      ['Прокрутка', summary.scrollEvents, 'Достижения порогов глубины']
    ];
    statsKpis.innerHTML = cards.map(function (card) {
      return '<article class="stats__kpi"><span>' + escapeHtml(card[0]) + '</span><strong>' + formatCount(card[1]) + '</strong><small>' + escapeHtml(card[2]) + '</small></article>';
    }).join('');

    var timeline = data.timeline || [];
    var maxValue = timeline.reduce(function (max, row) { return Math.max(max, row.pageViews || 0, row.clicks || 0); }, 1);
    statsTimeline.innerHTML = timeline.map(function (row) {
      var label = new Date(row.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      var views = Math.round((row.pageViews || 0) / maxValue * 100);
      var clicks = Math.round((row.clicks || 0) / maxValue * 100);
      return '<div class="stats__day" title="' + escapeHtml(row.date) + ': ' + formatCount(row.pageViews) + ' просмотров, ' + formatCount(row.clicks) + ' кликов">' +
        '<time>' + escapeHtml(label) + '</time><div class="stats__bars"><i class="stats__bar stats__bar--views" style="width:' + views + '%"></i><i class="stats__bar stats__bar--clicks" style="width:' + clicks + '%"></i></div>' +
        '<span>' + formatCount(row.pageViews) + ' / ' + formatCount(row.clicks) + '</span></div>';
    }).join('');

    renderRanking(statsPages, data.topPages, 'Страниц пока никто не открывал.');
    renderRanking(statsActions, data.topActions, 'Переходов и кликов пока нет.');
    renderRanking(statsDestinations, data.topDestinations, 'Ссылок пока не нажимали.');
    renderRanking(statsSources, data.sources, 'Источников пока нет.');
    renderRanking(statsDevices, data.devices, 'Нет данных об устройствах.');
    renderRanking(statsSections, data.sections, 'Разделы пока не просмотрены.');

    var eventNames = { page_view: 'Просмотр', session_start: 'Начало сеанса', click: 'Клик', section_view: 'Просмотр раздела', scroll_depth: 'Прокрутка' };
    var recent = data.recent || [];
    statsRecent.innerHTML = recent.length ? recent.map(function (event) {
      var detail = event.label || (event.target ? event.target : '—');
      if (event.type === 'session_start' && event.source) detail = 'Источник: ' + event.source;
      return '<tr><td>' + escapeHtml(formatEventTime(event.at)) + '</td><td>' + escapeHtml(eventNames[event.type] || event.type) + '</td><td>' + escapeHtml(detail) + '</td><td>' + escapeHtml(event.page || '/') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="stats__empty">Событий за этот период нет.</td></tr>';

    var privacyNote = 'События не содержат IP-адресов; временные HMAC-ключи используются только для ограничения запросов.';
    statsFootnote.textContent = data.limited
      ? 'Показаны последние ' + formatCount(data.maxStoredEvents) + ' событий за 90 дней; достигнут лимит хранения, поэтому более ранние события удалены. ' + privacyNote
      : privacyNote + ' Хранение — до 90 дней, максимум ' + formatCount(data.maxStoredEvents) + ' событий.';
    statsStatus.textContent = 'Обновлено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' · период: ' + formatCount(data.rangeDays) + ' дн. · записей в хранилище: ' + formatCount(data.storedEvents);
  }

  function loadStats() {
    var requestId = ++statsRequestId;
    var token = sessionStorage.getItem(AUTH_KEY);
    statsStatus.textContent = 'Загружаю статистику…';
    fetch('/api/analytics?days=' + encodeURIComponent(statsRange.value), {
      headers: { Authorization: 'Bearer ' + (token || '') },
      credentials: 'same-origin'
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          if (response.status === 401) {
            sessionStorage.removeItem(AUTH_KEY);
            location.reload();
          }
          throw new Error(data.error || 'Не удалось загрузить статистику.');
        }
        return data;
      });
    }).then(function (data) {
      if (requestId === statsRequestId) renderStats(data);
    }).catch(function (error) {
      if (requestId === statsRequestId) statsStatus.textContent = error.message || 'Не удалось загрузить статистику.';
    });
  }

  function exportStatsCsv() {
    if (!lastStats) return;
    var rows = [['Раздел', 'Название', 'Количество']];
    Object.keys(lastStats.summary || {}).forEach(function (key) { rows.push(['Сводка', key, lastStats.summary[key]]); });
    (lastStats.timeline || []).forEach(function (day) {
      rows.push(['Динамика по дням', day.date + ' · просмотры', day.pageViews]);
      rows.push(['Динамика по дням', day.date + ' · клики', day.clicks]);
      rows.push(['Динамика по дням', day.date + ' · сеансы', day.sessions]);
    });
    [['Популярные страницы', lastStats.topPages], ['Переходы и клики', lastStats.topActions], ['Куда переходят', lastStats.topDestinations], ['Источники сеансов', lastStats.sources], ['Устройства', lastStats.devices], ['Просмотры разделов', lastStats.sections]].forEach(function (group) {
      (group[1] || []).forEach(function (entry) { rows.push([group[0], entry.name, entry.count]); });
    });
    (lastStats.recent || []).forEach(function (event) {
      rows.push(['Последние события', formatEventTime(event.at) + ' · ' + event.type + ' · ' + event.page, event.label || event.target || event.source || '']);
    });
    var csv = '\uFEFF' + rows.map(function (row) {
      return row.map(function (cell) {
        var value = String(cell);
        if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
        return '"' + value.replace(/"/g, '""') + '"';
      }).join(';');
    }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'amanter-statistika-' + statsRange.value + '-dney.csv';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  galleryFile.addEventListener('change', function () {
    var file = galleryFile.files && galleryFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      gallery.push({ id: 'ph' + Date.now(), img: reader.result, alt: 'Работа AMANTER' });
      persist();
      render();
    };
    reader.readAsDataURL(file);
    galleryFile.value = '';
  });

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      activeSection = tab.dataset.section;
      render();
    });
  });

  document.getElementById('statsRefresh').addEventListener('click', loadStats);
  statsRange.addEventListener('change', loadStats);
  document.getElementById('statsExport').addEventListener('click', exportStatsCsv);

  /* ── Модал добавления/редактирования товара ── */
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modalTitle');
  var productForm = document.getElementById('productForm');
  var fTag = document.getElementById('fTag');
  var fName = document.getElementById('fName');
  var fDesc = document.getElementById('fDesc');
  var fPrice = document.getElementById('fPrice');
  var fImgFile = document.getElementById('fImgFile');
  var fImgPreview = document.getElementById('fImgPreview');
  var currentImg = '';

  function openModal(id) {
    editingId = id || null;
    var p = id ? products.find(function (x) { return x.id === id; }) : null;

    modalTitle.textContent = p ? 'Изменить товар' : 'Новый товар — ' + SECTION_NAMES[activeSection];
    fTag.value = p ? p.tag : '';
    fName.value = p ? p.name : '';
    fDesc.value = p ? p.desc : '';
    fPrice.value = p ? p.price : '';
    fImgFile.value = '';
    currentImg = p ? p.img : '';
    fImgPreview.src = resolveImg(currentImg) || '';
    fImgPreview.hidden = !currentImg;
    modal.hidden = false;
    fTag.focus();
  }

  function closeModal() {
    modal.hidden = true;
    editingId = null;
  }

  addBtn.addEventListener('click', function () {
    if (activeSection === 'gallery') {
      galleryFile.click();
    } else {
      openModal(null);
    }
  });
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  fImgFile.addEventListener('change', function () {
    var file = fImgFile.files && fImgFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      currentImg = reader.result; // base64 — хранится в localStorage
      fImgPreview.src = currentImg;
      fImgPreview.hidden = false;
    };
    reader.readAsDataURL(file);
  });

  productForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var data = {
      tag: fTag.value.trim(),
      name: fName.value.trim(),
      desc: fDesc.value.trim(),
      price: parseInt(fPrice.value, 10) || 0,
      img: currentImg || 'https://placehold.co/800x600/F2C4CE/8B1A2F?text=AMANTER'
    };

    if (editingId) {
      var p = products.find(function (x) { return x.id === editingId; });
      Object.assign(p, data);
    } else {
      data.id = 'p' + Date.now();
      data.section = activeSection;
      products.push(data);
    }

    persist();
    render();
    closeModal();
  });

  /* ── Сброс ── */
  document.getElementById('resetBtn').addEventListener('click', function () {
    if (confirm('Вернуть исходные товары и галерею? Все ваши изменения будут удалены.')) {
      Store.reset();
      products = Store.load();
      gallery = Store.loadGallery();
      render();
    }
  });

  /* ── Проверка сохранённой серверной сессии ── */
  var existingToken = sessionStorage.getItem(AUTH_KEY);
  if (existingToken) {
    fetch('/api/analytics?days=1', {
      headers: { Authorization: 'Bearer ' + existingToken },
      credentials: 'same-origin'
    }).then(function (response) {
      if (response.status === 401) {
        sessionStorage.removeItem(AUTH_KEY);
        return;
      }
      showPanel();
    }).catch(function () {
      loginError.textContent = 'Не удалось проверить вход. Проверьте подключение и войдите снова.';
      loginError.hidden = false;
    });
  }
})();

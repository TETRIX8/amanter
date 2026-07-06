/* AMANTER — логика админ-панели: вход по паролю,
   товары + фотогалерея (добавление / изменение / удаление, localStorage) */

(function () {
  'use strict';

  var Store = window.AmanterStore;
  var PASSWORD = 'amanter06345';
  var AUTH_KEY = 'amanter_admin_auth';

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
    if (passwordInput.value === PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1');
      loginError.hidden = true;
      showPanel();
    } else {
      loginError.hidden = false;
      passwordInput.value = '';
      passwordInput.focus();
    }
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

  /* ── Автовход (в конце: все переменные уже инициализированы) ── */
  if (sessionStorage.getItem(AUTH_KEY) === '1') showPanel();
})();

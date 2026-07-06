/* AMANTER — данные товаров (по умолчанию) + работа с localStorage.
   Админ-панель (/admin) перезаписывает список в localStorage,
   сайт читает его при загрузке. */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'amanter_products_v1';
  var GALLERY_KEY = 'amanter_gallery_v1';
  var WHATSAPP_PHONE = '79095110606';

  var DEFAULT_GALLERY = [
    { id: 'ph1', img: 'assets/insta-1.png', alt: 'Букет роз и ранункулюсов' },
    { id: 'ph2', img: 'assets/insta-2.png', alt: 'Макаруны и утренний кофе' },
    { id: 'ph3', img: 'assets/insta-3.png', alt: 'Доставка подарка AMANTER' },
    { id: 'ph4', img: 'assets/product-macarons.png', alt: 'Пирамида макарунов' },
    { id: 'ph5', img: 'assets/set-romance.png', alt: 'Набор роз и макарунов' },
    { id: 'ph6', img: 'assets/product-cake.png', alt: 'Торт с розами' }
  ];

  var DEFAULT_PRODUCTS = [
    /* ── Цветы ── */
    { id: 'f1', section: 'flowers', tag: 'Розы', name: '«Парижский вечер»', desc: '51 бордовая роза в шёлковой упаковке', price: 7900, img: 'assets/product-roses.png' },
    { id: 'f2', section: 'flowers', tag: 'Тюльпаны', name: '«Утро в Амстердаме»', desc: '35 нежных тюльпанов с атласной лентой', price: 4500, img: 'assets/product-tulips.png' },
    { id: 'f3', section: 'flowers', tag: 'Пионы', name: '«Облако нежности»', desc: '15 пионов сорта Sarah Bernhardt с эвкалиптом', price: 6800, img: 'assets/product-peonies.png' },
    { id: 'f4', section: 'flowers', tag: 'Авторские букеты', name: '«Сады Версаля»', desc: 'Розы, тюльпаны, лаванда и ветви сакуры', price: 9200, img: 'assets/product-author.png' },
    /* ── Сладости ── */
    { id: 's1', section: 'sweets', tag: 'Макаруны', name: '«Парижская дюжина»', desc: '12 макарунов: фисташка, малина, ваниль, роза', price: 2400, img: 'assets/product-macarons.png' },
    { id: 's2', section: 'sweets', tag: 'Тарты с ягодами', name: '«Летний сад»', desc: 'Тарт с клубникой, малиной и ванильным кремом', price: 3200, img: 'assets/product-tart.png' },
    { id: 's3', section: 'sweets', tag: 'Торты', name: '«Розовый бархат»', desc: 'Муссовый торт с глазурью и сусальным золотом', price: 4900, img: 'assets/product-cake.png' },
    { id: 's4', section: 'sweets', tag: 'Подарочные наборы', name: '«Гранд Ассорти»', desc: 'Макаруны, трюфели, тарталетки и чайная роза', price: 5600, img: 'assets/product-giftbox.png' },
    /* ── Наборы «Цветы + Сладости» ── */
    { id: 'g1', section: 'sets', tag: 'Набор', name: '«Роман в Париже»', desc: '15 бордовых роз и коробка из 16 макарунов ручной работы', price: 8900, img: 'assets/set-romance.png' },
    { id: 'g2', section: 'sets', tag: 'Набор', name: '«Нежность пиона»', desc: 'Пионы в шёлковой бумаге и муссовый торт с сусальным золотом', price: 11400, img: 'assets/set-tender.png' },
    { id: 'g3', section: 'sets', tag: 'Набор', name: '«Весенний рассвет»', desc: 'Тюльпаны, ягодный тарт и подарочная коробка с бантом', price: 9700, img: 'assets/set-spring.png' },
    { id: 'g4', section: 'sets', tag: 'Набор', name: '«Королевский вечер»', desc: 'Авторский букет и большой набор «Гранд Ассорти»', price: 14900, img: 'assets/set-royal.png' }
  ];

  function loadProducts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) return list;
      }
    } catch (e) { /* повреждённые данные — используем дефолт */ }
    return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  }

  function saveProducts(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function resetProducts() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(GALLERY_KEY);
  }

  function loadGallery() {
    try {
      var raw = localStorage.getItem(GALLERY_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (e) { /* повреждённые данные — используем дефолт */ }
    return JSON.parse(JSON.stringify(DEFAULT_GALLERY));
  }

  function saveGallery(list) {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(list));
  }

  function formatPrice(num) {
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009') + ' ₽';
  }

  function whatsappLink(product) {
    var text = 'Здравствуйте! Хочу заказать в AMANTER: ' + product.name +
      ' — ' + formatPrice(product.price) + '. Подскажите, пожалуйста, по доставке.';
    return 'https://wa.me/' + WHATSAPP_PHONE + '?text=' + encodeURIComponent(text);
  }

  global.AmanterStore = {
    PHONE: WHATSAPP_PHONE,
    DEFAULTS: DEFAULT_PRODUCTS,
    load: loadProducts,
    save: saveProducts,
    reset: resetProducts,
    loadGallery: loadGallery,
    saveGallery: saveGallery,
    formatPrice: formatPrice,
    whatsappLink: whatsappLink
  };
})(window);

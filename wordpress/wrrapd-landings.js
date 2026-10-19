/* Wrrapd campaign landing pages (/landing1 … /landing6). */
(function () {
  'use strict';
  var CFG = window.WRRAPD_LANDING || {};
  var API = CFG.api || 'https://api.wrrapd.com';
  var EXT = CFG.extensionUrl || 'https://chromewebstore.google.com/detail/wrrapd/lobngnjcjeimefihnobdmocicopikoip';
  var root = document.getElementById('wrrapd-landing') || mountHomeParts();
  if (!root) return;

  /* Homepage: hide old sections (CSS + DOM), place new body sections, mount two-ways note only. */
  function mountHomeParts() {
    var tpl = document.getElementById('wl6-parts');
    var bodyMount = document.getElementById('wl6-body');
    var parts = {};
    if (tpl && tpl.content) {
      Array.prototype.forEach.call(tpl.content.querySelectorAll('[data-wl6]'), function (el) {
        parts[el.getAttribute('data-wl6')] = el;
      });
    }
    if (bodyMount) {
      Array.prototype.forEach.call(bodyMount.querySelectorAll('[data-wl6]'), function (el) {
        parts[el.getAttribute('data-wl6')] = el;
      });
    }
    if (!parts.strip && !parts.hiw) return null;

    function placeStrip() {
      if (!parts.strip) return;
      var shell = document.querySelector('.occasion-ticker-shell');
      var ticker = document.querySelector('.elementor-element-0a7e92b');
      var wheels = document.getElementById('wrrapd-retailer-wheels-row');
      var header = document.querySelector('.elementor-location-header');
      if (wheels) wheels.insertAdjacentElement('afterend', parts.strip);
      else if (shell && shell.parentNode) shell.parentNode.insertBefore(parts.strip, shell);
      else if (ticker && ticker.parentNode) ticker.parentNode.insertBefore(parts.strip, ticker);
      else if (header) header.insertAdjacentElement('afterend', parts.strip);
      if (parts.waysbar && parts.strip.parentNode) parts.strip.parentNode.insertBefore(parts.waysbar, parts.strip);
    }
    placeStrip();
    setTimeout(placeStrip, 400);
    setTimeout(placeStrip, 1400);
    if (parts.dealpop) document.body.appendChild(parts.dealpop);

    [document.querySelector('.occasion-ticker-shell'), document.querySelector('.elementor-element-0a7e92b')].forEach(function (el) {
      if (el) el.setAttribute('aria-hidden', 'true');
    });
    ['.elementor-element-6b1d5da', '.elementor-element-3b1e47e', '.elementor-element-f68c5e7', '.elementor-element-d0991cd', '.wrrapd-gift-guides'].forEach(function (s) {
      document.querySelectorAll(s).forEach(function (el) {
        var node = el.classList && el.classList.contains('wrrapd-gift-guides')
          ? (el.closest('.elementor-element') || el)
          : el;
        if (node.parentNode) node.parentNode.removeChild(node);
      });
    });
    /* Gift guides live on /gift-ideas/ — strip any late re-inject. */
    function scrubGuides() {
      document.querySelectorAll('.wrrapd-gift-guides, .elementor-element-3b1e47e, .elementor-element-6b1d5da').forEach(function (el) {
        var node = el.classList && el.classList.contains('wrrapd-gift-guides')
          ? (el.closest('.elementor-element') || el)
          : el;
        if (node.parentNode) node.parentNode.removeChild(node);
      });
    }
    setTimeout(scrubGuides, 200);
    setTimeout(scrubGuides, 800);
    setTimeout(scrubGuides, 1800);

    var footer = document.querySelector('.elementor-element-bdc63f8') || document.querySelector('.elementor-location-footer');
    if (footer && footer.parentNode) {
      [parts.hiw, parts.paste, parts.ideas].forEach(function (p) {
        if (p) footer.parentNode.insertBefore(p, footer);
      });
    }
    if (bodyMount && bodyMount.parentNode && !bodyMount.children.length) bodyMount.parentNode.removeChild(bodyMount);

    ensureHeaderWays(parts.ways);
    return document.body;
  }

  function takeWaysNode(preferred) {
    if (preferred && preferred.nodeType === 1) return preferred;
    var live = document.querySelector('.wl6-ways');
    if (live) return live;
    var tpl = document.getElementById('wl6-parts');
    return tpl && tpl.content ? tpl.content.querySelector('[data-wl6="ways"]') : null;
  }

  /* Mount ① label + orange button on one row; OR + ② sit below the button. */
  function ensureHeaderWays(preferredWays) {
    function findBtn(scope) {
      return (scope || document).querySelector('.elementor-element-7f1bdc1, [data-id="7f1bdc1"]') ||
        (function () {
          var a = (scope || document).querySelector('a.elementor-button');
          return a && a.closest('.elementor-element');
        })();
    }
    function apply() {
      var ways = takeWaysNode(preferredWays);
      var header = document.querySelector('.elementor-location-header');
      if (!ways || !header) return false;
      var host = header.querySelector('.elementor-element-00ec9fc, [data-id="00ec9fc"]');
      var btn = findBtn(host || header);
      if (!host && btn) host = btn.parentElement;
      if (!host || !btn) return false;
      var slot = ways.querySelector('.wl6-ways-btn-slot');
      if (!slot) return false;
      host.classList.add('wl6-has-ways');
      host.style.setProperty('overflow', 'visible', 'important');
      if (!host.contains(ways)) host.insertBefore(ways, host.firstChild);
      if (btn.parentElement !== slot) slot.appendChild(btn);
      return true;
    }
    if (apply()) return;
    document.addEventListener('DOMContentLoaded', apply);
    window.addEventListener('load', apply);
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (apply() || tries > 20) clearInterval(timer);
    }, 250);
  }

  function $(sel, el) { return (el || root).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ctaHtml(label) {
    return '<a class="wl-btn wl-btn-sm" href="' + esc(EXT) + '" target="_blank" rel="noopener" data-wl-cta>' + esc(label) + '</a>';
  }

  /* ---------- Holiday milestones (Eastern time) ---------- */
  var MILESTONES = [
    { name: 'Thanksgiving', strip: 'Thanksgiving', day: 'Thu, Nov 26', orderBy: '2026-11-20', label: 'Fri, Nov 20', note: 'Hostess gifts and thank-yous.', q: 'thanksgiving day gifts' },
    { name: 'Hanukkah', strip: 'Hanukkah', day: 'Begins Fri, Dec 4', orderBy: '2026-11-28', label: 'Sat, Nov 28', note: 'Eight nights of wrapped surprises.', q: 'hanukkah gift ideas' },
    { name: 'Christmas', strip: 'Christmas', day: 'Fri, Dec 25', orderBy: '2026-12-18', label: 'Fri, Dec 18', note: 'Wrapped and under the tree.', q: 'christmas gift ideas' },
    { name: "New Year's Eve", strip: 'New Year', day: 'Thu, Dec 31', orderBy: '2026-12-23', label: 'Wed, Dec 23', note: 'Hostess gifts for the big night.', q: "new year's gift ideas" },
    { name: "Valentine's Day", strip: "Valentine's", day: 'Sun, Feb 14', orderBy: '2027-02-08', label: 'Mon, Feb 8', note: 'Flowers and a gift, wrapped with love.', q: "valentine's day gifts" },
    { name: 'Easter', strip: 'Easter', day: 'Sun, Mar 28', orderBy: '2027-03-22', label: 'Mon, Mar 22', note: 'Spring baskets and sweet surprises.', q: 'easter gifts' },
    { name: "Mother's Day", strip: "Mother's Day", day: 'Sun, May 9', orderBy: '2027-05-03', label: 'Mon, May 3', note: 'Wrapped with flowers, just for her.', q: "mother's day gift ideas" },
    { name: "Father's Day", strip: "Father's Day", day: 'Sun, Jun 20', orderBy: '2027-06-14', label: 'Mon, Jun 14', note: 'A wrapped surprise for Dad.', q: "father's day gift ideas" },
  ];
  function shopUrl(m) {
    return 'https://wrrapd.com/go/amazon/?to=' + encodeURIComponent('https://www.amazon.com/s?k=' + encodeURIComponent(m.q).replace(/%20/g, '+'));
  }
  function daysLeft(m, now) { return Math.max(0, Math.ceil((deadlineMs(m.orderBy) - now) / 86400000)); }
  function deadlineMs(ymd) { return new Date(ymd + 'T23:59:59-05:00').getTime(); }
  function nextMilestone(now) {
    for (var i = 0; i < MILESTONES.length; i++) if (deadlineMs(MILESTONES[i].orderBy) > now) return i;
    return -1;
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function easternParts(d) {
    try {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric' }).formatToParts(d);
      var o = {};
      f.forEach(function (p) { o[p.type] = p.value; });
      return { month: o.month, day: Number(o.day) };
    } catch (e) {
      return { month: '', day: d.getDate() };
    }
  }

  function initRescue() {
    var title = $('[data-wl-rescue-title]');
    var now = new Date();
    var ep = easternParts(now);
    if (title && (ep.month === 'December' && ep.day <= 24 || ep.month === 'November' && ep.day >= 15)) {
      title.textContent = 'It\u2019s ' + ep.month + ' ' + ordinal(ep.day) + ' and nothing is wrapped?';
    }
    var box = $('[data-wl-milestones]');
    var idx = nextMilestone(now.getTime());
    if (box) {
      var first = idx > 0 ? idx : 0;
      box.innerHTML = MILESTONES.slice(first, first + 4).map(function (m, k) {
        var i = first + k;
        var cls = 'wl-ms' + (i === idx ? ' wl-ms-next' : (idx === -1 || i < idx ? ' wl-ms-past' : ''));
        return '<div class="' + cls + '"><h3>' + esc(m.name) + '</h3><p>' + esc(m.day) + '</p><p>' + esc(m.note) + '</p><p class="wl-ms-by">Order by ' + esc(m.label) + '</p></div>';
      }).join('');
    }
    var card = $('[data-wl-countdown]');
    if (!card) return;
    if (idx === -1) { card.style.display = 'none'; return; }
    var m = MILESTONES[idx];
    $('[data-wl-cd-date]', card).textContent = m.label;
    $('[data-wl-cd-name]', card).textContent = m.name;
    var end = deadlineMs(m.orderBy);
    var cells = { d: $('[data-wl-cd="d"]', card), h: $('[data-wl-cd="h"]', card), m: $('[data-wl-cd="m"]', card), s: $('[data-wl-cd="s"]', card) };
    function tick() {
      var left = Math.max(0, end - Date.now());
      var s = Math.floor(left / 1000);
      cells.d.textContent = pad(Math.floor(s / 86400));
      cells.h.textContent = pad(Math.floor(s % 86400 / 3600));
      cells.m.textContent = pad(Math.floor(s % 3600 / 60));
      cells.s.textContent = pad(s % 60);
      if (left <= 0) { initRescue(); return; }
      setTimeout(tick, 1000 - Date.now() % 1000);
    }
    tick();
  }

  /* ---------- 10-second checkout demo ---------- */
  var DEMO_STORES = [
    { store: 'Target', url: 'www.target.com/checkout', title: 'LEGO Icons Bumblebee Set', img: 'https://target.scene7.com/is/image/Target/GUEST_2c7410d9-3a5a-41d2-a0fe-f53eeabd2726?wid=300&hei=300&qlt=80' },
    { store: 'Etsy', url: 'www.etsy.com/cart', title: 'Handmade Cedar Wind Chime', img: 'https://i.etsystatic.com/12200091/r/il/e19d8e/5475173991/il_794xN.5475173991_dadd.jpg' },
    { store: 'Amazon', url: 'www.amazon.com/checkout', title: 'Goodnight Moon (Board Book)', img: 'https://covers.openlibrary.org/b/isbn/9780694003617-M.jpg' },
  ];
  function initDemo() {
    var demo = $('[data-wl-demo]');
    if (!demo) return;
    var body = $('.wl-browser-body', demo);
    var cursor = $('[data-wl-demo-cursor]', demo);
    var sw = $$('[data-wl-sw]', demo);
    var steps = $$('[data-wl-demo-steps] li', demo);
    var bar = $('[data-wl-demo-bar]', demo);
    var LOOP = 10000;
    var loop = 0;
    var t0 = 0;
    var timers = [];
    DEMO_STORES.forEach(function (s) { var i = new Image(); i.src = s.img; });

    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function pointAt(el) {
      if (!el) return;
      var b = body.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      cursor.style.left = (r.left - b.left + r.width / 2 - 11) + 'px';
      cursor.style.top = (r.top - b.top + r.height / 2 - 11) + 'px';
    }
    function step(i) { steps.forEach(function (li, k) { li.classList.toggle('wl-on', k === i); }); }
    function pickSwatch(i) { sw.forEach(function (x, k) { x.classList.toggle('wl-on', k === i); }); }
    function set(cls, on) { demo.classList.toggle(cls, on); }

    function run() {
      timers.forEach(clearTimeout);
      timers = [];
      var s = DEMO_STORES[loop % DEMO_STORES.length];
      loop++;
      $('[data-wl-demo-store]', demo).textContent = s.store;
      $('[data-wl-demo-url]', demo).textContent = s.url;
      $('[data-wl-demo-title]', demo).textContent = s.title;
      $('[data-wl-demo-img]', demo).src = s.img;
      ['wl-s-panel', 'wl-s-toggle', 'wl-s-flowers', 'wl-s-press', 'wl-s-done'].forEach(function (c) { set(c, false); });
      pickSwatch(-1);
      step(0);
      pointAt($('.wl-cart-item', demo));
      t0 = Date.now();
      at(1000, function () { set('wl-s-panel', true); step(1); });
      at(1600, function () { pointAt($('[data-wl-demo-toggle]', demo)); });
      at(2300, function () { set('wl-s-toggle', true); });
      at(3000, function () { step(2); pointAt(sw[0]); pickSwatch(0); });
      at(3600, function () { pointAt(sw[1]); pickSwatch(1); });
      at(4200, function () { pointAt(sw[2]); pickSwatch(2); });
      at(4900, function () { pointAt(sw[0]); pickSwatch(0); });
      at(5600, function () { step(3); pointAt($('[data-wl-demo-flowers] .wl-box', demo)); });
      at(6200, function () { set('wl-s-flowers', true); });
      at(6900, function () { pointAt($('[data-wl-demo-place]', demo)); });
      at(7500, function () { set('wl-s-press', true); });
      at(7800, function () { set('wl-s-press', false); set('wl-s-done', true); step(4); });
      at(LOOP, run);
    }
    function frame() {
      if (bar) bar.style.width = Math.min(100, (Date.now() - t0) / LOOP * 100) + '%';
      requestAnimationFrame(frame);
    }
    run();
    requestAnimationFrame(frame);
  }

  /* ---------- Occasion strip (landing6) ---------- */
  function initStrip() {
    var row = $('[data-wl-strip]');
    if (!row) return;
    var now = Date.now();
    var idx = nextMilestone(now);
    if (idx === -1) { row.closest('.wl-strip').style.display = 'none'; return; }
    function short(s) { return String(s).replace(/^(Begins )?[A-Z][a-z]{2}, /, ''); }
    var count = window.matchMedia && window.matchMedia('(max-width: 700px)').matches ? 3 : 4;
    row.innerHTML = MILESTONES.slice(idx, idx + count).map(function (m, k) {
      var left = daysLeft(m, now);
      var label = m.strip || m.name;
      var badge = k === 0 ? '<span class="wl-strip-next">' + (left <= 1 ? 'Last day' : left + ' days') + '</span>' : '';
      return '<a class="wl-strip-card' + (k === 0 ? ' wl-on' : '') + '" href="' + esc(shopUrl(m)) + '" target="_blank" rel="noopener sponsored" title="Shop ' + esc(m.name) + ' gifts">' +
        '<b>' + esc(label) + '</b><small>' + esc(short(m.day)) + ' · by ' + esc(short(m.label)) + '</small>' + badge + '</a>';
    }).join('');
  }

  /* Splashy multi-item discount pop — flashes on Step 2 + paste hover. */
  var dealPopTimer = null;
  var dealPopHold = 0;
  function dealPopEl() {
    var el = document.getElementById('wl-deal-pop');
    if (el && !document.body.contains(el)) document.body.appendChild(el);
    return el;
  }
  function placeDealPopNear(anchor) {
    var pop = dealPopEl();
    if (!pop) return;
    if (!anchor || !anchor.getBoundingClientRect) {
      pop.style.left = '50%';
      pop.style.top = '42%';
      return;
    }
    var r = anchor.getBoundingClientRect();
    var x = Math.min(window.innerWidth - 24, Math.max(24, r.left + r.width / 2));
    var y = Math.min(window.innerHeight - 24, Math.max(72, r.top - 18));
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }
  function flashDealPop(anchor) {
    var pop = dealPopEl();
    if (!pop) return;
    placeDealPopNear(anchor);
    pop.hidden = false;
    pop.classList.remove('is-hold', 'is-on');
    void pop.offsetWidth;
    pop.classList.add('is-on');
    clearTimeout(dealPopTimer);
    dealPopTimer = setTimeout(function () {
      if (dealPopHold > 0) return;
      pop.classList.remove('is-on');
      pop.hidden = true;
    }, 2600);
  }
  function holdDealPop(on, anchor) {
    var pop = dealPopEl();
    if (!pop) return;
    if (on) {
      dealPopHold += 1;
      placeDealPopNear(anchor);
      pop.hidden = false;
      pop.classList.remove('is-on');
      pop.classList.add('is-hold');
      clearTimeout(dealPopTimer);
    } else {
      dealPopHold = Math.max(0, dealPopHold - 1);
      if (dealPopHold > 0) return;
      pop.classList.remove('is-hold', 'is-on');
      pop.hidden = true;
    }
  }
  function wireDealPopHover(el) {
    if (!el || el._wlDealPop) return;
    el._wlDealPop = true;
    el.addEventListener('mouseenter', function () { holdDealPop(true, el); });
    el.addEventListener('mouseleave', function () { holdDealPop(false); });
    el.addEventListener('focus', function () { holdDealPop(true, el); });
    el.addEventListener('blur', function () { holdDealPop(false); });
  }

  /* ---------- How it works demo (landing6) ---------- */
  function initHowItWorks() {
    var demo = $('[data-wl-hiw]');
    if (!demo) return;
    var body = $('.wl-browser-body', demo);
    var cursor = $('[data-wl-h-cursor]', demo);
    var url = $('[data-wl-h-url]', demo);
    var sw = $$('[data-wl-h-sw]', demo);
    var stepBtns = $$('[data-wl-hiw-steps] button');
    var bar = $('[data-wl-h-bar]', demo);
    var STATES = ['wl-s-added', 'wl-s-panel', 'wl-s-toggle', 'wl-s-flowers', 'wl-s-hub', 'wl-s-sum', 'wl-s-paid', 'wl-s-press', 'wl-s-ship', 'wl-s-cart', 'wl-s-install', 'wl-s-done'];
    var LOOP = 15000;
    var START = [0, 2300, 4700, 7400, 9500, 12200];
    var timers = [];
    var t0 = 0;
    var loop = 0;
    var store = DEMO_STORES[0];
    var lastStep = -1;
    DEMO_STORES.forEach(function (s) { var i = new Image(); i.src = s.img; });

    function set(cls, on) { demo.classList.toggle(cls, on); }
    function scene(name) { ['wl-s-install', 'wl-s-cart', 'wl-s-ship', 'wl-s-done'].forEach(function (c) { set(c, c === 'wl-s-' + name); }); }
    function pointAt(el) {
      if (!el) return;
      var b = body.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      cursor.style.left = (r.left - b.left + r.width / 2 - 11) + 'px';
      cursor.style.top = (r.top - b.top + r.height / 2 - 11) + 'px';
    }
    function step(i) {
      stepBtns.forEach(function (b, k) { b.parentNode.classList.toggle('wl-on', k === i); });
      if (i === 1 && lastStep !== 1) {
        var shopBtn = stepBtns[1];
        flashDealPop(shopBtn || demo);
      }
      lastStep = i;
    }
    function pick(i) { sw.forEach(function (x, k) { x.classList.toggle('wl-on', k === i); }); }
    function press(el) { if (!el) return; el.classList.add('wl-pressed'); setTimeout(function () { el.classList.remove('wl-pressed'); }, 220); }

    var TL = [
      [0, function () { STATES.forEach(function (c) { set(c, false); }); pick(-1); scene('install'); step(0); url.textContent = 'chromewebstore.google.com'; pointAt($('.wl-cws img', demo)); }],
      [700, function () { pointAt($('[data-wl-h-add]', demo)); }],
      [1400, function () { press($('[data-wl-h-add]', demo)); set('wl-s-added', true); }],
      [2300, function () {
        scene('cart'); step(1); url.textContent = store.url;
        $('[data-wl-h-store]', demo).textContent = store.store;
        $('[data-wl-h-title]', demo).textContent = store.title;
        $('[data-wl-h-img]', demo).src = store.img;
        pointAt($('.wl-cart-item', demo));
      }],
      [3000, function () { set('wl-s-panel', true); }],
      [3500, function () { pointAt($('[data-wl-h-toggle]', demo)); }],
      [4100, function () { set('wl-s-toggle', true); }],
      [4700, function () { step(2); pointAt(sw[1]); pick(1); }],
      [5300, function () { pointAt(sw[2]); pick(2); }],
      [5900, function () { pointAt(sw[0]); pick(0); }],
      [6500, function () { pointAt($('[data-wl-h-flowers] .wl-box', demo)); }],
      [6900, function () { set('wl-s-flowers', true); }],
      [7400, function () { scene('ship'); step(3); url.textContent = store.url.replace(/(cart|checkout)$/, 'shipping'); pointAt($('.wl-addr', demo)); }],
      [8100, function () { pointAt($('[data-wl-h-hub]', demo)); }],
      [8700, function () { set('wl-s-hub', true); }],
      [9500, function () { scene('cart'); step(4); url.textContent = store.url; set('wl-s-sum', true); pointAt($('.wl-cart-item', demo)); }],
      [10100, function () { pointAt($('[data-wl-h-pay]', demo)); }],
      [10700, function () { press($('[data-wl-h-pay]', demo)); set('wl-s-paid', true); }],
      [11300, function () { set('wl-s-panel', false); pointAt($('[data-wl-h-place]', demo)); }],
      [11800, function () { press($('[data-wl-h-place]', demo)); }],
      [12200, function () { scene('done'); step(5); url.textContent = 'wrrapd.com/orders'; pointAt($('.wl-proof', demo)); }],
    ];

    function run(from) {
      timers.forEach(clearTimeout);
      timers = [];
      if (!from) store = DEMO_STORES[loop++ % DEMO_STORES.length];
      demo.classList.add('wl-jump');
      TL.forEach(function (e) { if (e[0] <= from) e[1](); });
      void demo.offsetWidth;
      demo.classList.remove('wl-jump');
      t0 = Date.now() - from;
      TL.forEach(function (e) { if (e[0] > from) timers.push(setTimeout(e[1], e[0] - from)); });
      timers.push(setTimeout(function () { run(0); }, LOOP - from));
    }

    /* Plays only while the visitor hovers the section (tap to play on touch screens). */
    var playing = false;
    var pos = 0;
    function stopTimers() { timers.forEach(clearTimeout); timers = []; }
    function play(from) {
      playing = true;
      demo.classList.add('wl-playing');
      run(from == null ? pos : from);
    }
    function pause() {
      if (!playing) return;
      playing = false;
      pos = (Date.now() - t0) % LOOP;
      stopTimers();
      demo.classList.remove('wl-playing');
    }
    stepBtns.forEach(function (b) {
      b.addEventListener('click', function () { play(START[Number(b.dataset.step)] || 0); });
    });
    var section = demo.closest('.wl-hiw') || demo;
    var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover) {
      section.addEventListener('mouseenter', function () { play(); });
      section.addEventListener('mouseleave', pause);
    } else {
      demo.classList.add('wl-touch');
      demo.addEventListener('click', function () { if (playing) pause(); else play(); });
    }
    function frame() {
      if (bar && t0 && playing) bar.style.width = Math.min(100, (Date.now() - t0) / LOOP * 100) + '%';
      requestAnimationFrame(frame);
    }
    run(0);
    stopTimers();
    t0 = Date.now();
    requestAnimationFrame(frame);
  }

  /* ---------- Paste & wrap (landing6) ---------- */
  function initPaste() {
    wireDealPopHover(document.querySelector('label[for="wl-paste-link"]'));
    wireDealPopHover(document.getElementById('wl-paste-link'));
    wireDealPopHover(document.querySelector('.wl6-ways-opt2 a'));
    wireDealPopHover(document.querySelector('.wl-ways-bar a[href="#paste-and-wrap"]'));
    var form = $('[data-wl-paste]');
    if (form) {
      var input = $('input[name="link"]', form);
      var zip = $('input[name="zip"]', form);
      var out = $('.wl-paste-out', form);
      form.addEventListener('submit', function (e) {
        var v = input.value.trim();
        var m = v.match(/https?:\/\/\S+/i);
        var z = zip ? String(zip.value || '').replace(/\D/g, '').slice(0, 5) : '';
        if (!v) { e.preventDefault(); location.href = form.action + '#wb-start'; return; }
        if (!m) { e.preventDefault(); out.textContent = 'Please paste the full product link, starting with https://'; input.focus(); return; }
        if (z.length !== 5) { e.preventDefault(); out.textContent = 'Please enter the giftee\'s 5-digit zip code.'; if (zip) zip.focus(); return; }
        input.value = m[0];
        if (zip) zip.value = z;
      });
      input.addEventListener('input', function () { out.textContent = ''; });
      if (zip) zip.addEventListener('input', function () { out.textContent = ''; });
    }
    var phone = $('[data-wl-phone]');
    if (!phone) return;
    var typeEl = $('[data-wl-phone-type]', phone);
    var LINK = 'target.com/p/lego-icons-bumblebee';
    var timers = [];
    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function run() {
      timers.forEach(clearTimeout);
      timers = [];
      phone.className = 'wl-phone';
      typeEl.textContent = '';
      at(500, function () { phone.classList.add('wl-p-paste'); typeEl.textContent = LINK; });
      at(1500, function () { phone.classList.add('wl-p-card'); });
      at(2900, function () { phone.classList.add('wl-p-wrap'); });
      at(4400, function () { phone.classList.add('wl-p-done'); });
      at(7600, run);
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.3 });
      io.observe(phone);
    } else {
      run();
    }
  }

  /* ---------- Jacksonville ZIP checker ---------- */
  var HOODS = {
    '32202': 'Downtown', '32204': 'Riverside', '32205': 'Avondale', '32206': 'Springfield', '32207': 'San Marco',
    '32208': 'Northwest Jacksonville', '32209': 'Northwest Jacksonville', '32210': 'Ortega', '32211': 'Arlington',
    '32212': 'NAS Jacksonville', '32216': 'Southside', '32217': 'San Jose', '32218': 'Northside', '32219': 'Northside',
    '32220': 'Westside', '32221': 'Westside', '32222': 'Westside', '32223': 'Mandarin', '32224': 'Intracoastal West',
    '32225': 'Fort Caroline', '32226': 'Oceanway', '32227': 'Mayport', '32228': 'Mayport', '32233': 'Atlantic Beach',
    '32234': 'Baldwin', '32244': 'Argyle', '32246': 'Southside', '32250': 'Jacksonville Beach', '32254': 'Westside',
    '32256': 'Deerwood', '32257': 'Mandarin', '32258': 'Bartram Park', '32266': 'Neptune Beach', '32277': 'Arlington',
  };
  var ribbonHoods = ['Riverside', 'Avondale', 'San Marco', 'Ortega', 'Mandarin', 'Jacksonville Beach', 'Atlantic Beach',
    'Neptune Beach', 'Southside', 'Arlington', 'Deerwood', 'Springfield', 'Downtown', 'Bartram Park', 'Oceanway', 'San Jose', 'Intracoastal West', 'Argyle'];
  var zipList = null;
  function loadZips() {
    if (zipList) return Promise.resolve(zipList);
    return fetch(API + '/api/allowed-zip-codes', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { zipList = (j && j.allowedZipCodes) || Object.keys(HOODS); return zipList; })
      .catch(function () { zipList = Object.keys(HOODS); return zipList; });
  }
  function initZip() {
    $$('[data-wl-zip]').forEach(function (wrap) {
      var form = $('form', wrap);
      var input = $('input', form);
      var out = $('.wl-zip-out', wrap);
      input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 5); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var zip = input.value.replace(/\D/g, '').slice(0, 5);
        if (zip.length !== 5) { out.innerHTML = '<div class="wl-zip-soon"><p>Please enter a 5-digit ZIP code.</p></div>'; return; }
        out.innerHTML = '<div class="wl-zip-soon"><p>Checking\u2026</p></div>';
        loadZips().then(function (list) {
          if (list.indexOf(zip) >= 0) {
            var hood = HOODS[zip] || 'Jacksonville';
            out.innerHTML = '<div class="wl-zip-yes"><p>Yes! We deliver gift-wrapped gifts to ' + esc(hood) + ' (' + esc(zip) + ').</p>' + ctaHtml('Add to Chrome, free') + '</div>';
          } else {
            out.innerHTML = '<div class="wl-zip-soon"><p>We\u2019re coming to ' + esc(zip) + ' soon. Want a note when we arrive?</p>' +
              '<form class="wl-wait" data-wl-wait data-page="landing' + esc(CFG.page) + '" data-zip="' + esc(zip) + '" novalidate><div class="wl-wait-row">' +
              '<input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Your email" required>' +
              '<button type="submit" class="wl-btn wl-btn-sm">Notify me</button></div><p class="wl-wait-out" aria-live="polite"></p></form></div>';
            bindWait($('[data-wl-wait]', out));
          }
        });
      });
    });
    var track = $('[data-wl-hoods]');
    if (track) {
      var row = ribbonHoods.map(function (h) { return '<span>' + esc(h) + '</span>'; }).join('');
      track.innerHTML = row + row;
    }
  }

  /* ---------- Waitlist ---------- */
  function bindWait(form) {
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var out = $('.wl-wait-out', form);
      var email = ($('input[name="email"]', form) || {}).value || '';
      var cityEl = $('input[name="city"]', form);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { out.textContent = 'Please enter a valid email.'; return; }
      var btn = $('button', form);
      btn.disabled = true;
      out.textContent = 'Saving\u2026';
      fetch(API + '/api/landing/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), city: cityEl ? cityEl.value : '', zip: form.dataset.zip || '', page: form.dataset.page || '' }),
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok) { out.textContent = 'You\u2019re on the list! We\u2019ll email you when Wrrapd arrives.'; form.reset(); }
        else { out.textContent = (j && j.error) || 'Please try again.'; btn.disabled = false; }
      }).catch(function () { out.textContent = 'Please try again.'; btn.disabled = false; });
    });
  }
  function initCities() {
    $$('[data-wl-wait]').forEach(bindWait);
    var chips = $$('.wl-city');
    chips.forEach(function (b) {
      b.addEventListener('click', function () {
        chips.forEach(function (x) { x.classList.toggle('wl-on', x === b); });
        var city = $('[data-wl-wait] input[name="city"]');
        if (city) city.value = b.dataset.city;
        var em = $('[data-wl-wait] input[name="email"]');
        if (em) em.focus();
      });
    });
  }

  /* ---------- Gift tag preview ---------- */
  function initTag() {
    var note = $('[data-wl-note]');
    var msg = $('[data-wl-tag-msg]');
    var occ = $('[data-wl-tag-occ]');
    if (!note || !msg) return;
    function sync() { msg.textContent = note.value || 'Your message here'; }
    note.addEventListener('input', sync);
    sync();
    var chips = $$('.wl-occ');
    var samples = {
      Birthday: 'Happy birthday, Mom! Wish I could be there to hug you. Love, Sam',
      'Get well': 'Sending you sunshine and a big hug. Feel better soon!',
      'New baby': 'Welcome to the world, little one! We love you already.',
      Anniversary: 'Happy anniversary to my favorite couple. Cheers to you both!',
      'Thinking of you': 'Just because. Thinking of you today and always.',
      Holidays: 'Merry everything! Wish we were there to celebrate with you.',
    };
    chips.forEach(function (b) {
      b.addEventListener('click', function () {
        chips.forEach(function (x) { x.classList.toggle('wl-on', x === b); });
        occ.textContent = b.dataset.occ;
        note.value = samples[b.dataset.occ] || note.value;
        sync();
      });
    });
  }

  /* ---------- Paper picker ---------- */
  function initPapers() {
    var box = $('.wl-combo-box .wl-gift');
    var papers = $$('.wl-paper');
    papers.forEach(function (b) {
      b.addEventListener('click', function () {
        papers.forEach(function (x) { x.classList.toggle('wl-on', x === b); });
        if (box) {
          box.className = box.className.replace(/wl-pat-\w+/, 'wl-pat-' + b.dataset.pat);
          var hero = $('.wl-combo');
          if (hero && hero.getBoundingClientRect().bottom < 0) window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  initRescue();
  initStrip();
  initDemo();
  initHowItWorks();
  initPaste();
  initZip();
  initCities();
  initTag();
  initPapers();
  if (document.body && document.body.classList.contains('wrrapd-landing-6')) ensureHeaderWays();
  /* Header ways mount can lag — re-wire paste hover targets once the note is in the DOM. */
  setTimeout(function () {
    wireDealPopHover(document.querySelector('.wl6-ways-opt2 a'));
    wireDealPopHover(document.querySelector('label[for="wl-paste-link"]'));
  }, 600);
})();

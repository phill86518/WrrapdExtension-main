/* Wrrapd — "We buy it for you" page (/buy/). Talks to api.wrrapd.com/api/buy/*. */
(function () {
  'use strict';
  var CFG = window.WRRAPD_BUY || {};
  var API = CFG.api || 'https://api.wrrapd.com';
  var PAY = CFG.pay || 'https://pay.wrrapd.com/buy/pay';
  var EXT = CFG.extensionUrl || 'https://chromewebstore.google.com/detail/wrrapd/lobngnjcjeimefihnobdmocicopikoip';
  var root = document.getElementById('wrrapd-buy');
  if (!root) return;

  var qs = new URLSearchParams(location.search);
  var preview = qs.get('preview') || sessionStorage.getItem('wbPreview') || '';
  if (qs.get('preview')) sessionStorage.setItem('wbPreview', preview);

  var S = {
    config: null,
    terms: null,
    pricing: null,
    id: qs.get('b') || '',
    token: qs.get('t') || '',
    batch: null,
    view: 'start',
    wrapIndex: 0,
    pollTimer: null,
    error: '',
    notice: '',
    busy: false,
    draftLinks: null,
    flowers: null,
    ai: {},
    variantDraft: {},
    promptedWrap: '',
    modalZipOk: false,
    startZipOk: false,
    startZip: '',
  };

  var TRASH_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  var MAIL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(c) { return '$' + (Number(c || 0) / 100).toFixed(2); }
  function shortUrl(raw) {
    try {
      var u = new URL(raw);
      var path = u.pathname.replace(/\/$/, '');
      if (path.length > 36) path = path.slice(0, 34) + '…';
      return u.hostname.replace(/^www\./, '') + path;
    } catch (e) {
      return String(raw || '').slice(0, 48);
    }
  }
  function usdNum(n) { return '$' + Number(n || 0).toFixed(2); }
  function fmtDate(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return '';
    var p = ymd.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  /** Latest Estimated Delivery* to Wrrapd (end of a printed window when present). */
  function latestItemArrivalYmd() {
    var latest = '';
    cartSlotLines().forEach(function (l) {
      var s = l.product && l.product.standardShip;
      if (!s) return;
      var d = s.arrivalDateEnd || s.arrivalDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > latest) latest = d;
    });
    return latest;
  }
  function ymdPlusOne(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return '';
    var p = ymd.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)).toISOString().slice(0, 10);
  }
  function deliveryFootnote() {
    var hub = latestItemArrivalYmd();
    var together = hub ? ymdPlusOne(hub) : '';
    var line = '* Estimated delivery date to Wrrapd; final gift delivery to the giftee may add 1 day';
    if (together) line += '; all gifts delivered together on ' + fmtDate(together) + '.';
    else line += '.';
    return line;
  }
  function cartHasElectronics() {
    return readyLines().some(function (l) { return l.product && l.product.isElectronics; });
  }
  /** Need Terms when never accepted, version changed, or electronics were added after accept. */
  function needsTermsGate() {
    if (!S.batch) return false;
    if (S.batch.needsTerms === true) return true;
    if (!S.batch.termsAccepted) return true;
    if (cartHasElectronics() && !S.batch.electronicsAccepted) return true;
    return false;
  }
  function ensureTermsLoaded() {
    if (S.terms && S.terms.version) return Promise.resolve(S.terms);
    return fetch(API + '/api/buy/terms').then(function (r) { return r.json(); }).then(function (j) {
      S.terms = j;
      return j;
    });
  }
  /** Show Terms first; after Agree, continue to wrap / pay / review. */
  function openTermsThen(next) {
    S.pendingAfterTerms = next || 'wrap';
    S.termsOpen = true;
    S.termsScrolled = false;
    S.wrapOpen = false;
    S.error = '';
    ensureTermsLoaded().then(function () { render(); }).catch(function () {
      S.error = 'Please refresh the page to load the Terms.';
      render();
    });
    render();
  }
  function $(sel) { return root.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function request(path, body, method) {
    var m = method || (body ? 'POST' : 'GET');
    var url = API + path;
    var init = { method: m, headers: { 'Content-Type': 'application/json' } };
    if (m === 'GET' && S.token && path.indexOf('/api/buy/batches/') === 0) url += (url.indexOf('?') < 0 ? '?' : '&') + 't=' + encodeURIComponent(S.token);
    if (body) init.body = JSON.stringify(S.token ? Object.assign({ t: S.token }, body) : body);
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'Something went wrong. Please try again.');
          e.status = r.status;
          e.code = j.code;
          throw e;
        }
        return j;
      });
    });
  }
  function setUrl() {
    var u = new URL(location.href);
    if (S.id) { u.searchParams.set('b', S.id); u.searchParams.set('t', S.token); }
    else { u.searchParams.delete('b'); u.searchParams.delete('t'); }
    history.replaceState(null, '', u.toString());
  }
  function startOver() {
    clearTimeout(S.pollTimer);
    S.id = '';
    S.token = '';
    S.batch = null;
    S.view = 'start';
    S.wrapIndex = 0;
    S.wrapOpen = false;
    S.termsOpen = false;
    S.flowersOpen = false;
    S.addOpen = false;
    S.payRefreshId = '';
    S.promptedWrap = '';
    S.error = '';
    S.notice = '';
    S.busy = false;
    S.draftLinks = null;
    S.ai = {};
    S.variantDraft = {};
    S.manualEmailFor = '';
    S.manualShut = '';
    S.occBad = false;
    S.modalZipOk = false;
    S.startZipOk = false;
    S.startZip = '';
    S.lastHtml = '';
    setUrl();
    render();
    var zip = $('#wb-zip');
    if (zip) zip.focus();
  }

  function extLine() {
    return '<p class="wb-ext-line">Prefer to buy it yourself and have us gift-wrap? Simply add the free <a href="' + esc(EXT) + '" target="_blank" rel="noopener">Wrrapd Chrome extension</a> and select us for gift-wrapping at retailer checkout.</p>';
  }

  /* ---------- views ---------- */
  function render() {
    if (S.view === 'start') {
      var zipEl = root.querySelector('#wb-zip');
      if (zipEl) {
        var typed = String(zipEl.value || '').replace(/\D/g, '').slice(0, 5);
        S.startZip = typed;
        if (typed.length !== 5) S.startZipOk = false;
      }
      if (S.draftLinks == null) {
        var existing = root.querySelectorAll('.wb-link');
        if (existing.length) S.draftLinks = Array.prototype.map.call(existing, function (i) { return i.value; });
      }
    }
    var wrapScroll = root.querySelector('.wb-wrap-scroll');
    var keepWrapTop = wrapScroll ? wrapScroll.scrollTop : 0;
    var keepPageTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    var html = '';
    if (S.view === 'start') html = viewStart();
    else if (S.view === 'items') html = viewItems();
    else if (S.view === 'wrap') html = viewWrap();
    else if (S.view === 'review') html = viewReview();
    else if (S.view === 'paid') html = viewPaid();
    var next = '<div class="wb-wrap">' + html + '</div>' + (S.termsOpen ? viewTerms() : '') + (S.wrapOpen && !S.termsOpen ? viewWrap() : '');
    if (next === S.lastHtml) return;
    S.lastHtml = next;
    root.innerHTML = next;
    bind();
    var again = root.querySelector('.wb-wrap-scroll');
    if (again && keepWrapTop) again.scrollTop = keepWrapTop;
    if (keepPageTop) window.scrollTo(0, keepPageTop);
  }

  function maxLinks() {
    return (S.config && S.config.maxLinks) || 5;
  }
  function linkFields(count, values, locked) {
    var h = '<div class="wb-links' + (locked ? ' wb-links-locked' : '') + '">';
    for (var i = 0; i < count; i++) {
      h += '<input class="wb-input wb-link" type="url" inputmode="url" placeholder="Paste a product link" aria-label="Product link ' + (i + 1) + '" value="' + esc((values && values[i]) || '') + '"' + (locked ? ' disabled' : '') + '>';
    }
    return h + '</div>';
  }
  function buyButton(adding) {
    var locked = !adding && !S.startZipOk;
    var label = S.busy ? 'Checking…' : (adding ? 'Add these items to list above' : 'Buy for me and gift-wrap these items');
    var btn = '<button type="button" class="wb-btn' + (adding ? ' wb-btn-add' : '') + '" data-act="submit-links"' + (S.busy || locked ? ' disabled' : '') + '>' + esc(label) + '</button>';
    return adding ? '<div class="wb-submit">' + btn + '</div>' : btn;
  }
  function zipBar(id, value, act, ok) {
    return '<div class="wb-zipbar"><label class="wb-zipbar-label" for="' + id + '">Giftee / gift-recipient\'s zip code:</label>' +
      '<p class="wb-zipbar-hint">This helps us with a faster checkout! Also enter this same ZIP on the retailer\'s product page so shipping is accurate.</p>' +
      '<div class="wb-zipbar-row"><input class="wb-zipbar-input' + (ok ? ' wb-zip-ok' : '') + '" id="' + id + '" inputmode="numeric" maxlength="10" autocomplete="postal-code" placeholder="ZIP code" value="' + esc(value || '') + '">' +
      '<button type="button" class="wb-btn wb-zip-submit" data-act="' + act + '"' + (S.busy || S.zipChecking ? ' disabled' : '') + '>' + (S.zipChecking ? 'Checking…' : 'Submit') + '</button></div></div>';
  }
  function viewStart() {
    var open = S.config && S.config.open;
    var stores = S.config ? S.config.retailers.map(function (r) { return r.name; }).join(', ') : '';
    var h = '<section class="wb-hero"><h1>Order through us</h1><p>You choose the gifts. We gift-wrap them and deliver them.</p></section>';
    h += '<section class="wb-options">' +
      '<div class="wb-option"><h2>Chrome extension</h2><p>Shop at the store and add gift-wrap at checkout with the free Wrrapd Chrome extension.</p>' +
      '<a class="wb-btn wb-ext-btn" href="' + esc(EXT) + '" target="_blank" rel="noopener">Get the FREE Chrome Extension</a></div>' +
      '<div class="wb-option wb-option-main"><h2>Order through us</h2><p>Paste up to ' + esc(maxLinks()) + ' product links. You buy through us. We gift-wrap every item and deliver it.</p>' +
      (open ? '<a class="wb-btn" href="#wb-start">Start</a>' : '<p class="wb-soon">Coming soon.</p>') + '</div></section>';
    if (!open) return h;
    var draft = S.draftLinks;
    S.draftLinks = null;
    h += '<section class="wb-card" id="wb-start"><h2>Your gift</h2>' +
      zipBar('wb-zip', S.startZip, 'start-zip', S.startZipOk) +
      (S.startZipOk
        ? '<label class="wb-label">Paste the product links for gift-wrapping below.</label>' + LOAD_TIP
        : '<p class="wb-zip-first">Enter the giftee ZIP code first.</p>') +
      linkFields(maxLinks(), draft, !S.startZipOk) +
      '<p class="wb-stores">' + (S.config ? S.config.retailers.map(function (r) { return '<span>' + esc(r.name) + '</span>'; }).join('') : esc(stores)) + '</p>' +
      (S.error ? '<p class="wb-error">' + esc(S.error) + '</p>' : '') +
      buyButton() + '</section>';
    return h;
  }

  function groupFor(retailer) {
    return (S.batch.groups || []).filter(function (g) { return g.retailer === retailer; })[0] || null;
  }

  var WAIT_ADD = 'Please wait while we add that to your gift-wrapping cart…';
  var LOAD_TIP = '<p class="wb-muted wb-load-tip">Items can take up to 90 seconds each to load. Paste all your product links at once for a faster cart.</p>';
  var WAIT_DETAILS = 'Getting additional details…';

  function canEdit() {
    return S.view === 'items' && !(S.batch.refresh && S.batch.refresh.state === 'running');
  }

  function itemCell(l) {
    var title = l.product && l.product.title ? l.product.title : 'Item';
    var shown = shortTitle(title, 80);
    var img = l.product && l.product.imageUrl ? '<img src="' + esc(l.product.imageUrl) + '" alt="">' : '<span class="wb-img-ph"></span>';
    var h = '<div class="wb-item">' + img + '<div class="wb-item-main">';
    if (l.product) {
      var name = esc(shown);
      h += l.url
        ? '<p class="wb-row-title" title="' + esc(title) + '"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + name + '</a></p>'
        : '<p class="wb-row-title" title="' + esc(title) + '">' + name + '</p>';
    } else if (l.url) h += '<p class="wb-linkline"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(shortUrl(l.url)) + '</a></p>';
    var variant = variantText(l.variantLabel);
    if (variant) h += '<p class="wb-variant">' + esc(variant) + '</p>';
    if (l.product && l.product.isElectronics) h += '<p class="wb-muted">Electronics</p>';
    if (l.state === 'reading') {
      h += '<p class="wb-status"><span class="wb-spin"></span>' +
        (l.product ? 'Updating this item…' : WAIT_ADD) + '</p>';
    }
    if (l.state === 'needs_variant' && l.product) {
      var groups = l.product.variantGroups || [];
      h += '<div class="wb-variants">';
      groups.forEach(function (vg) {
        var picked = S.variantDraft[l.id + '|' + vg.name] || (vg.options.indexOf(vg.selected) >= 0 ? vg.selected : '');
        h += '<p class="wb-label">Choose ' + esc(vg.name.toLowerCase()) + '</p>';
        if (vg.options.length > 8) {
          h += '<select class="wb-input" data-variant="' + esc(l.id) + '" data-group="' + esc(vg.name) + '"><option value="">Choose…</option>' +
            vg.options.map(function (o) { return '<option value="' + esc(o) + '"' + (picked === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
        } else {
          h += '<div class="wb-choice-row">';
          vg.options.forEach(function (o) {
            h += '<button type="button" class="wb-choice' + (picked === o ? ' wb-choice-on' : '') + '" data-act="pick-variant" data-line="' + esc(l.id) + '" data-group="' + esc(vg.name) + '" data-value="' + esc(o) + '">' + esc(o) + '</button>';
          });
          h += '</div>';
        }
      });
      var wide = groups.some(function (vg) { return vg.options.length > 8; });
      if (wide) h += '<button type="button" class="wb-btn" data-act="variant" data-line="' + esc(l.id) + '">Confirm</button>';
      h += '</div>';
    }
    var asked = l.manual === 'requested';
    if (excluded(l) && !asked) h += '<p class="wb-unavailable">' + esc(limitMessage(l)) + '</p>';
    else if (l.state === 'unavailable' && !asked) h += '<p class="wb-unavailable">' + esc(l.message || "We can't buy this item right now.") + '</p>';
    if (l.state === 'unavailable') h += manualCell(l);
    else if (l.manual === 'in_cart') h += '<p class="wb-manual-note">' + MAIL_SVG + 'Added by Wrrapd</p>';
    return h + '</div></div>';
  }

  function onlyItem(l) {
    return !S.batch.lines.some(function (o) { return o.id !== l.id && o.state !== 'removed' && o.state !== 'unavailable'; });
  }
  function manualCell(l) {
    if (l.manual === 'requested') {
      return '<p class="wb-manual-note">' + MAIL_SVG + (onlyItem(l)
        ? 'This item will be added for you manually; we will email you when it is ready.'
        : 'This item will be added for you manually; please complete the remaining order.') + '</p>';
    }
    if (l.manual !== 'available' || !canEdit()) return '';
    var asking = S.manualEmailFor === l.id;
    var pop = asking
      ? '<p class="wb-manual-explain">We will email you when this item is ready to add to your order.</p>' +
        '<label class="wb-label" for="wb-manual-email">Your email</label>' +
        '<input class="wb-input wb-manual-email" id="wb-manual-email" type="email" autocomplete="email" maxlength="120" placeholder="you@example.com">' +
        '<div class="wb-manual-actions"><button type="button" class="wb-btn wb-btn-sm" data-act="manual-send" data-line="' + esc(l.id) + '"' + (S.busy ? ' disabled' : '') + '>Email me when ready</button>' +
        '<button type="button" class="wb-btn wb-btn-sm wb-btn-ghost" data-act="manual-no" data-line="' + esc(l.id) + '">Cancel</button></div>'
      : '<p>We could not read this item automatically. Want us to add it by hand and email you when it is ready?</p>' +
        '<div class="wb-manual-actions"><button type="button" class="wb-btn wb-btn-sm" data-act="manual-yes" data-line="' + esc(l.id) + '"' + (S.busy ? ' disabled' : '') + '>Yes, email me</button>' +
        '<button type="button" class="wb-btn wb-btn-sm wb-btn-ghost" data-act="manual-no" data-line="' + esc(l.id) + '">No thanks</button></div>';
    return '<div class="wb-manual' + (asking ? ' wb-manual-open' : '') + (S.manualShut === l.id ? ' wb-manual-shut' : '') + '">' +
      '<button type="button" class="wb-manual-btn" data-act="manual-open" data-line="' + esc(l.id) + '">' + MAIL_SVG + '<span>Add it manually</span></button>' +
      '<div class="wb-manual-pop" role="dialog" aria-label="Add it manually">' + pop + '</div></div>';
  }

  function priceCell(l) {
    if (l.state === 'reading') return '—';
    var quoted = knownCents(l);
    var page = l.product && l.product.pagePriceCents;
    var c = quoted != null ? quoted : page;
    return c != null ? '<span class="wb-price">' + usd(c) + '</span>' : '—';
  }

  function shipOf(l) {
    var s = l.product && l.product.standardShip;
    if (s && (s.cents != null || s.arrivalDate || s.note)) return s;
    return null;
  }

  function waiting(l) {
    return l.state === 'reading' || ((l.state === 'quoting' || l.state === 'needs_variant') && !l.product);
  }

  function deliveryCell(l) {
    var s = shipOf(l);
    if (s && s.arrivalDate && s.arrivalDateEnd && s.arrivalDateEnd !== s.arrivalDate) {
      return esc(fmtDate(s.arrivalDate) + ' – ' + fmtDate(s.arrivalDateEnd));
    }
    if (s && s.arrivalDate) return esc(fmtDate(s.arrivalDate));
    if (waiting(l)) return '<span class="wb-spin" aria-hidden="true"></span>';
    return '—';
  }

  // Standard U.S. ship-to-home. Same numbers as lib/buy/standard-shipping.js. No club rates.
  var SHIP_FEE = { nordstrom: 0, kohls: 895, walmart: 699, target: 599, sephora: 695, ulta: 695, amazon: 399, bestbuy: 599 };
  var SHIP_FREE = { nordstrom: 0, kohls: 4900, walmart: 3500, target: 3500, amazon: 3500, sephora: 5000, ulta: 3500, bestbuy: 3500 };
  function scheduleFee(retailer, merch) {
    if (retailer === 'lego') {
      if (merch <= 2500) return 495;
      if (merch <= 3499) return 695;
      return 0;
    }
    if (SHIP_FREE[retailer] != null && merch >= SHIP_FREE[retailer]) return 0;
    return SHIP_FEE[retailer] != null ? SHIP_FEE[retailer] : null;
  }
  function groupShipCents(lines) {
    if (!lines.length) return null;
    var merch = 0;
    var any = false;
    var pageFee = null;
    lines.forEach(function (l) {
      var c = knownCents(l);
      if (c != null) { merch += c * qtyOf(l); any = true; }
      var s = shipOf(l);
      if (s && s.cents > 0) pageFee = pageFee == null ? s.cents : Math.max(pageFee, s.cents);
    });
    if (!any) return null;
    var scheduled = scheduleFee(lines[0].retailer, merch);
    if (scheduled === 0) return 0;
    if (pageFee != null) return pageFee;
    return scheduled;
  }
  function costCell(l, lines, index) {
    var cents = groupShipCents(lines || [l]);
    if (cents == null) {
      var s = shipOf(l);
      if (s && s.note) return esc(s.note);
      return '—';
    }
    if (cents === 0) return 'Free';
    if (index > 0) return '—';
    return usd(cents);
  }

  function wrapTargets() {
    return (S.batch && S.batch.lines || []).filter(function (l) {
      return l.state !== 'removed' && l.state !== 'unavailable';
    });
  }
  function wrapPriceOf(l) {
    var map = (S.batch && S.batch.wrapPrices) || {};
    return map[l.id] || null;
  }
  function acctLines(parts) {
    if (parts.length === 1 && !parts[0].label) return esc(parts[0].amount);
    return '<div class="wb-acct">' + parts.map(function (p) {
      return '<div class="wb-acct-line"><span>' + esc(p.label || '') + '</span><span>' + esc(p.amount) + '</span></div>';
    }).join('') + '</div>';
  }
  function tbd() { return '<span class="wb-tbd">TBD</span>'; }
  function wrapCell(l) {
    if (!(l.wrap && l.wrap.done)) return tbd();
    var pl = wrapPriceOf(l);
    if (!pl) return tbd();
    var base = Math.max(0, (pl.wrapBaseCents || 0) - (pl.wrapDiscountCents || 0));
    if (!pl.designCents) return usd(base);
    var design = l.wrap.style === 'upload' ? 'Your design' : 'Custom design';
    return acctLines([{ label: 'Gift-wrap', amount: usd(base) }, { label: design, amount: usd(pl.designCents) }]);
  }
  function flowerCell(l) {
    if (!(l.wrap && l.wrap.done)) return tbd();
    var pl = wrapPriceOf(l);
    if (pl && pl.flowersCents) return usd(pl.flowersCents);
    if (l.wrap && l.wrap.flowers) return tbd();
    return '—';
  }
  function colgroup(edit) {
    return '<colgroup><col class="wb-col-retailer"><col class="wb-col-item"><col class="wb-col-when"><col class="wb-col-price"><col class="wb-col-qty"><col class="wb-col-ship"><col class="wb-col-wrap"><col class="wb-col-flowers"><col class="wb-col-total">' + (edit ? '<col class="wb-col-del">' : '') + '</colgroup>';
  }
  function headRow(edit) {
    return '<thead><tr><th scope="col">Retailer</th><th scope="col">Item</th><th scope="col">Estimated Delivery*</th><th scope="col">Unit price</th><th scope="col">Qty</th><th scope="col">Shipping cost</th><th scope="col">Gift-wrapping cost</th><th scope="col">Floral cost</th><th scope="col">Item<br>Total</th>' +
      (edit ? '<th scope="col"><span class="wb-sr">Delete</span></th>' : '') + '</tr></thead>';
  }
  function groupLines(lines) {
    var order = [];
    var by = {};
    lines.forEach(function (l) {
      var key = l.retailerName ? l.retailer : '_other';
      if (!by[key]) {
        by[key] = { key: key, name: l.retailerName || 'Other links', retailer: l.retailerName ? l.retailer : null, lines: [] };
        order.push(key);
      }
      by[key].lines.push(l);
    });
    return order.map(function (key) { return by[key]; });
  }
  function retailerSummary(g) {
    var itemSum = 0;
    var anyPrice = false;
    g.lines.forEach(function (l) {
      var c = lineTotalCents(l);
      if (c != null) { itemSum += c; anyPrice = true; }
    });
    return '<span class="wb-rname">' + esc(g.name) + '</span>' +
      '<span class="wb-rsub">Items ' + (anyPrice ? usd(itemSum) : '—') + '</span>';
  }
  function lineCells(l, edit, retailer, gLines, gIndex) {
    var h = '<td data-label="Item">' + itemCell(l) + '</td>' +
      '<td data-label="Estimated delivery" class="wb-money">' + (retailer ? deliveryCell(l) : '—') + '</td>' +
      '<td data-label="Unit price" class="wb-money">' + priceCell(l) + '</td>' +
      '<td data-label="Qty" class="wb-qtycell">' + qtyCell(l) + '</td>' +
      '<td data-label="Shipping cost" class="wb-money wb-shipcost">' + (retailer ? costCell(l, gLines, gIndex) : '—') + '</td>' +
      '<td data-label="Gift-wrapping cost" class="wb-money">' + wrapCell(l) + '</td>' +
      '<td data-label="Floral cost" class="wb-money">' + flowerCell(l) + '</td>' +
      '<td data-label="Item total" class="wb-money">' + totalCell(l) + '</td>';
    if (edit) h += '<td class="wb-del"><button type="button" class="wb-trash" data-act="remove" data-line="' + esc(l.id) + '" aria-label="Delete item" title="Delete item">' + TRASH_SVG + '</button></td>';
    return h;
  }
  function cartTable(lines) {
    var active = lines.filter(function (l) { return !excluded(l); });
    if (!active.length) return '';
    var edit = canEdit();
    var h = '<table class="wb-table">' + colgroup(edit) + headRow(edit) + '<tbody>';
    groupLines(active).forEach(function (g) {
      g.lines.forEach(function (l, i) {
        h += '<tr class="wb-tr wb-row-' + esc(l.state) + (i === 0 ? ' wb-group-start' : '') + '">';
        if (i === 0) h += '<td class="wb-retailer" rowspan="' + g.lines.length + '" data-label="Retailer">' + retailerSummary(g) + '</td>';
        h += lineCells(l, edit, g.retailer, g.lines, i) + '</tr>';
      });
    });
    return h + endTotals(lines) + '</tbody></table>';
  }

  function linkKey(url) {
    try {
      var u = new URL(url);
      u.hash = '';
      return u.protocol + '//' + u.host.toLowerCase() + u.pathname.replace(/\/$/, '') + u.search;
    } catch (e) {
      return String(url || '');
    }
  }
  function excluded(l) {
    if (l.state !== 'unavailable') return false;
    var key = linkKey(l.url);
    var lines = S.batch && S.batch.lines || [];
    if (lines.some(function (o) { return o !== l && o.state !== 'removed' && o.state !== 'unavailable' && linkKey(o.url) === key; })) return false;
    return !lines.some(function (o) { return o !== l && o.state === 'unavailable' && linkKey(o.url) === key && lines.indexOf(o) < lines.indexOf(l); });
  }
  function limitMessage(l) {
    if (l.reason === 'over_item_limit') {
      var cap = S.batch && S.batch.limits && S.batch.limits.perItemCapCents;
      var price = l.product && l.product.pagePriceCents;
      if (price && cap) return 'This item is over the purchase limit (' + usd(price) + ' versus ' + usd(cap) + ').';
      return l.message || 'This item is over the purchase limit.';
    }
    return l.message || "We can't buy this item right now.";
  }
  function itemTables(lines) {
    return cartTable(lines);
  }

  function stillWorking() {
    return S.batch.lines.some(function (l) { return l.state === 'reading' || l.state === 'quoting' || l.state === 'needs_variant'; });
  }
  function readyLines() {
    return S.batch.lines.filter(function (l) { return l.state === 'ready'; });
  }

  function visibleLines() {
    return S.batch.lines.filter(function (l) { return l.state !== 'removed'; });
  }
  /** Slots toward the paste limit — Excluded rows do not use up "add more" room. */
  function cartSlotLines() {
    return visibleLines().filter(function (l) { return !excluded(l); });
  }
  function knownCents(l) {
    var g = groupFor(l.retailer);
    if (l.state === 'ready' && g && g.itemPrices && g.itemPrices[l.id]) return g.itemPrices[l.id];
    if (l.state !== 'unavailable' && l.product && l.product.pagePriceCents) return l.product.pagePriceCents;
    return null;
  }
  function maxQty() {
    return (S.config && S.config.maxQty) || 10;
  }
  function variantText(label) {
    if (!label || /^\s*size:\s*\d+(\.\d+)?\s*"?\s*x\s*\d+/i.test(label)) return '';
    if (/^choose a /i.test(label)) return '';
    return String(label).split(',').map(function (p) {
      p = p.trim();
      var m = p.match(/^[^:]{1,24}:\s*(.+)$/);
      return (m ? m[1] : p).trim();
    }).filter(Boolean).join(', ');
  }
  function qtyOf(l) {
    var n = Math.round(Number(l && l.qty));
    return n >= 1 && n <= maxQty() ? n : 1;
  }
  function lineTotalCents(l) {
    var c = knownCents(l);
    return c == null ? null : c * qtyOf(l);
  }
  function qtyCell(l) {
    if (l.state === 'reading') return '—';
    if (!canEdit() || l.state === 'unavailable') return String(qtyOf(l));
    var n = qtyOf(l);
    return '<div class="wb-stepper"><span class="wb-qty-n">' + n + '</span>' +
      '<button type="button" class="wb-step" data-act="qty-up" data-line="' + esc(l.id) + '" aria-label="Increase quantity"' + (n >= maxQty() ? ' disabled' : '') + '>+</button>' +
      '<button type="button" class="wb-step" data-act="qty-down" data-line="' + esc(l.id) + '" aria-label="Decrease quantity"' + (n <= 1 ? ' disabled' : '') + '>−</button></div>';
  }
  function totalCell(l) {
    if (l.state === 'reading') return '—';
    var c = lineTotalCents(l);
    return c != null ? usd(c) : '—';
  }
  function limitLine() {
    var lim = S.batch.limits || {};
    return '<p class="wb-limit">Cumulative purchase limit for item prices: ' + usd(lim.merchandiseCapCents) + ', per item limit of ' + usd(lim.perItemCapCents) + '</p>';
  }
  function viewItems() {
    var b = S.batch;
    var lines = visibleLines();
    var rows = itemTables(lines);
    var excludedHtml = excludedBlock(lines);
    var targets = wrapTargets();
    var canGo = targets.length > 0;
    var allWrapped = canGo && targets.every(function (l) { return l.wrap && l.wrap.done; });
    var empty = lines.length === 0;
    var slotted = cartSlotLines().length;
    var room = slotted < maxLinks();
    var draft = S.draftLinks;
    S.draftLinks = null;
    var left = Math.max(0, maxLinks() - slotted);
    var more = left === 1 ? 'Add up to 1 more item' : 'Add up to ' + left + ' more items';
    var paste = LOAD_TIP + linkFields(left, draft) + buyButton(true);
    ensureFlowers();
    var h = '<section class="wb-card"><div class="wb-card-top"><h2>Gift-wrapping shopping cart</h2>' +
      '<button type="button" class="wb-btn wb-btn-ghost wb-start-over" data-act="start-over">Start over</button></div>' +
      '<div class="wb-cart-head">' + zipBar('wb-zip-edit', b.gifteeZip, 'cart-zip', false) +
      extLine() + '</div>' +
      (S.notice ? '<p class="wb-notice">' + esc(S.notice) + '</p>' : '') +
      (rows || (empty ? '<p class="wb-muted">Paste a product link to start.</p>' + paste : (excludedHtml ? '' : '<p class="wb-muted">Paste a product link to start.</p>'))) +
      (rows ? '<p class="wb-asterisk">' + esc(deliveryFootnote()) + '</p><p class="wb-ship-note">Shipping prices do not reflect any club membership or other discounts.</p>' : '') +
      excludedHtml +
      (room && !empty && !S.addOpen ? '<button type="button" class="wb-btn wb-add-more" data-act="add-more">' + more + '</button>' : '') +
      (room && !empty && S.addOpen ? '<p class="wb-ask">' + more + ' for gift-wrapping</p>' + paste : '') +
      '</section>';
    if (!b.bill && b.billError && !stillWorking() && readyLines().length) h += '<p class="wb-error">' + esc(b.billError) + '</p>';
    h += limitLine();
    if (allWrapped && b.bill) h += '<section class="wb-card wb-review">' + billBlock(b.bill) + '</section>';
    if (S.error) h += '<p class="wb-error">' + esc(S.error) + '</p>';
    h += '<div class="wb-actions wb-cart-actions">';
    if (allWrapped) {
      h += '<button type="button" class="wb-btn wb-btn-ghost" data-act="open-wrap">Edit gift-wrap options</button>';
      h += '<button type="button" class="wb-btn" data-act="pay"' + (b.bill && !S.busy ? '' : ' disabled') + '>Review and pay</button>';
    } else {
      h += '<button type="button" class="wb-btn" data-act="open-wrap"' + (canGo ? '' : ' disabled') + '>Continue to gift-wrap</button>';
      h += '<button type="button" class="wb-btn wb-btn-ghost" data-act="pay" disabled>Review and pay</button>';
    }
    h += '</div>';
    if (lines.some(function (l) { return l.state === 'reading'; })) h += '<p class="wb-muted">Please keep this page open. Each item can take up to 90 seconds to load.</p>';
    return h;
  }
  function endTotals(lines) {
    var itemSum = 0;
    var shipSum = 0;
    var active = lines.filter(function (l) { return l.state !== 'unavailable'; });
    active.forEach(function (l) {
      var c = lineTotalCents(l);
      if (c != null) itemSum += c;
    });
    groupLines(active).forEach(function (g) {
      var c = groupShipCents(g.lines);
      if (c != null) shipSum += c;
    });
    var tax = S.batch.salesTaxPercent != null ? Math.round((itemSum + shipSum) * S.batch.salesTaxPercent / 100) : null;
    var gross = itemSum + shipSum + (tax || 0);
    var edit = canEdit();
    var taxText = tax != null ? usd(tax) : '—';
    var tail = edit ? '<td></td>' : '';
    return '<tr class="wb-endrow wb-sum-start"><td colspan="8">Sales tax</td><td class="wb-money">' + taxText + '</td>' + tail + '</tr>' +
      '<tr class="wb-endrow"><td colspan="8">Total shipping</td><td class="wb-money">' + usd(shipSum) + '</td>' + tail + '</tr>' +
      '<tr class="wb-endrow wb-bill-total"><td colspan="8">Gross total</td><td class="wb-money">' + usd(gross) + '</td>' + tail + '</tr>';
  }
  function excludedBlock(lines) {
    var rows = lines.filter(excluded);
    if (!rows.length) return '';
    var edit = canEdit();
    var h = '<div class="wb-store wb-excluded"><p class="wb-store-name">Items Excluded</p><table class="wb-table">' + colgroup(edit) + '<tbody>';
    groupLines(rows).forEach(function (g) {
      g.lines.forEach(function (l, i) {
        h += '<tr class="wb-tr wb-row-excluded' + (i === 0 ? ' wb-group-start' : '') + '">';
        if (i === 0) h += '<td class="wb-retailer" rowspan="' + g.lines.length + '" data-label="Retailer"><span class="wb-rname">' + esc(g.name) + '</span></td>';
        h += '<td data-label="Item">' + itemCell(l) + '</td>' +
          '<td data-label="Estimated delivery" class="wb-money">NA</td>' +
          '<td data-label="Unit price" class="wb-money">NA</td>' +
          '<td data-label="Qty" class="wb-qtycell">NA</td>' +
          '<td data-label="Shipping cost" class="wb-money">NA</td>' +
          '<td data-label="Gift-wrapping cost" class="wb-money">NA</td>' +
          '<td data-label="Floral cost" class="wb-money">NA</td>' +
          '<td data-label="Item total" class="wb-money">NA</td>';
        if (edit) h += '<td class="wb-del"><button type="button" class="wb-trash" data-act="remove" data-line="' + esc(l.id) + '" aria-label="Delete item" title="Delete item">' + TRASH_SVG + '</button></td>';
        h += '</tr>';
      });
    });
    return h + '</tbody></table></div>';
  }

  /** Short shopper-facing title — long Amazon strings must not blow out the bill layout. */
  function shortTitle(s, max) {
    max = max || 64;
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    var cut = s.slice(0, max - 1);
    var soft = cut.replace(/\s+\S*$/, '');
    return (soft.length >= Math.floor(max * 0.55) ? soft : cut).replace(/[|–—,:;\-\s]+$/g, '') + '…';
  }

  function billBlock(bill) {
    var shipCents = 0;
    var taxCents = 0;
    var items = '';
    bill.groups.forEach(function (g) {
      shipCents += g.shipping.cents || 0;
      taxCents += g.taxCents || 0;
      g.items.forEach(function (it) {
        var label = shortTitle(it.title, 52);
        var name = g.retailerName + ' · ' + label + (it.qty > 1 ? ' ×' + it.qty : '') + (it.variant ? ' (' + shortTitle(it.variant, 24) + ')' : '');
        items += row(name, usd(it.cents), it.title);
      });
    });
    var w = bill.wrap || {};
    var n = w.giftWrapCount || 0;
    var h = '<div class="wb-review-grid">' +
      '<section class="wb-bill-sec"><h2>Item purchases</h2>' + items +
      row('Shipping', shipCents ? usd(shipCents) : 'Free') +
      row('Sales tax', usd(taxCents)) +
      '<div class="wb-bill-row wb-bill-sub"><span>Items total</span><span>' + usd(bill.retailerCents) + '</span></div></section>' +
      '<section class="wb-bill-sec wb-bill-wrrapd"><h2>Gift-wrapping & flowers</h2>' +
      row('Gift-wrapping' + (n > 1 ? ' (×' + n + ')' : ''), usd(w.giftWrapCents || 0)) +
      (w.discountCents ? row('Multi-item discount', '-' + usd(w.discountCents)) : '') +
      (w.designAiCents ? row('AI design', usd(w.designAiCents)) : '') +
      (w.designUploadCents ? row('Your design', usd(w.designUploadCents)) : '') +
      (w.flowersCents ? row('Flowers', usd(w.flowersCents)) : '') +
      (w.boxCents ? row('Gift box', usd(w.boxCents)) : '') +
      row('Tax on gift-wrap', usd(w.serviceTaxCents || 0)) +
      '<div class="wb-bill-row wb-bill-sub"><span>Total Gift-Wrapping & Flowers</span><span>' + usd(w.totalCents || 0) + '</span></div></section></div>' +
      '<div class="wb-bill-row wb-bill-total"><span>Order total</span><span>' + usd(bill.totalCents) + '</span></div>';
    return h;
    function row(a, b, fullTitle) {
      return '<div class="wb-bill-row"><span title="' + esc(fullTitle || a) + '">' + esc(a) + '</span><span class="wb-bill-amt">' + esc(b) + '</span></div>';
    }
  }

  function viewTerms() {
    var t = S.terms;
    if (!t) return '';
    var needsElec = readyLines().some(function (l) { return l.product && l.product.isElectronics; });
    return '<div class="wb-modal" role="dialog" aria-modal="true" aria-labelledby="wb-terms-title"><div class="wb-modal-box">' +
      '<h2 id="wb-terms-title">' + esc(t.title) + '</h2><p class="wb-terms-sub">' + esc(t.subtitle) + '</p>' +
      t.leads.map(function (x) { return '<p class="wb-terms-lead">' + esc(x) + '</p>'; }).join('') +
      limitLine() +
      '<div class="wb-terms-body" id="wb-terms-body">' + t.html + '<p class="wb-terms-end">Version ' + esc(t.version) + '</p></div>' +
      (needsElec ? '<label class="wb-check"><input type="checkbox" id="wb-elec"> ' + esc(t.electronicsSentence) + '</label>' : '') +
      '<label class="wb-check"><input type="checkbox" id="wb-agree" disabled> ' + esc(t.agreeLabel) + '</label>' +
      '<p class="wb-muted" id="wb-scroll-hint">Please scroll to the end to agree.</p>' +
      (S.error ? '<p class="wb-error">' + esc(S.error) + '</p>' : '') +
      '<div class="wb-modal-actions"><button type="button" class="wb-btn wb-btn-ghost" data-act="close-terms">Back</button>' +
      '<button type="button" class="wb-btn" data-act="accept" id="wb-accept" disabled>Agree and continue</button></div></div></div>';
  }

  function unit(name) {
    var p = S.pricing && S.pricing.unitPrices;
    return p && p[name] != null ? usdNum(p[name]) : '';
  }

  function viewWrap() {
    var lines = wrapTargets();
    var l = lines[S.wrapIndex];
    if (!l) { S.wrapOpen = false; return ''; }
    var w = l.wrap || {};
    var style = w.style || 'wrrapd';
    var custom = S.pricing && S.pricing.customDesign && S.pricing.customDesign.available;
    var occ = (S.config.occasions || []).map(function (o) { return '<option value="' + esc(o) + '"' + (w.occasion === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    var ai = S.ai[l.id] || {};
    var title = l.product && l.product.title ? l.product.title : 'Item';
    var heading = lines.length > 1
      ? 'Item ' + (S.wrapIndex + 1) + ' of ' + lines.length + ' — Gift wrap with Wrrapd'
      : 'Gift wrap with Wrrapd';
    ensureFlowers();
    var h = '<div class="wb-modal" role="dialog" aria-modal="true" aria-label="Wrrapd gift wrap"><div class="wb-modal-box wb-wrap-modal"><div class="wb-wrap-scroll">' +
      '<h2 id="wb-wrap-title">' + esc(heading) + '</h2>' +
      '<p class="wb-zip-show">Giftee ZIP: <b>' + esc(S.batch && S.batch.gifteeZip) + '</b></p>';
    if (!l.product || l.state === 'reading') {
      h += '<p class="wb-status"><span class="wb-spin"></span>' + WAIT_ADD + '</p>' +
        (S.error ? '<p class="wb-error">' + esc(S.error) + '</p>' : '') +
        '</div>' + wrapNav(false) + '</div></div>';
      return h;
    }
    h += '<p class="wb-wrap-intro">Customize each item below. You\'ll complete Wrrapd\'s secure payment during checkout, then we wrap and ship to your giftee.</p>' +
      '<div class="wb-wrap-head">' +
      (l.product.imageUrl ? '<img src="' + esc(l.product.imageUrl) + '" alt="">' : '') +
      '<div class="wb-wrap-title" title="' + esc(title) + '">' + esc(shortTitle(title, 90)) + '</div></div>' +
      '<p class="wb-wrap-legend">Choose your wrapping</p>' +
      '<div class="wb-wrap-box">' +
      '<div class="wb-wrrapd-row">' +
      radio('wrrapd', 'Allow Wrrapd to choose the wrapping' + (unit('giftWrapBase') ? ' — ' + unit('giftWrapBase') : '')) +
      '<select class="wb-input wb-occ' + (S.occBad ? ' wb-occ-bad' : '') + '" id="wb-occ" aria-label="Occasion"' + (style === 'wrrapd' ? '' : ' hidden') + '><option value="">Select Occasion</option>' + occ + '</select></div>';
    if (style === 'wrrapd') {
      h += '<div class="wb-sub"><textarea class="wb-input wb-hint" id="wb-hint" maxlength="200" rows="2" placeholder="Other details for our wrap team (optional)">' + esc(w.wrrapdHint || '') + '</textarea></div>';
    }
    if (custom) {
      h += radio('upload', 'Upload my own design', unit('customDesignUpload') ? '(+' + unit('customDesignUpload') + ')' : '');
      if (style === 'upload') {
        var preview = (S.previews && S.previews[l.id]) || (w.upload && w.upload.imageUrl) || '';
        h += '<div class="wb-sub"><input type="file" id="wb-file" accept="image/*">' +
          (preview ? '<img class="wb-upload-preview" src="' + esc(preview) + '" alt="">' : '') +
          (w.upload && w.upload.fileName ? '<p class="wb-muted">Uploaded: ' + esc(w.upload.fileName) + '</p>' : '') +
          '</div>';
      }
      h += radio('ai', 'Generate a design with AI', unit('customDesignAi') ? '(+' + unit('customDesignAi') + ')' : '');
      if (style === 'ai') {
        h += '<div class="wb-sub"><p class="wb-ai-hint">What\'s the occasion? Who is the giftee? What do they like? Please feel free to suggest any themes...</p>' +
          '<textarea class="wb-input wb-hint" id="wb-ai-prompt" rows="3" placeholder="e.g., Valentine\'s Day gift for my 28 yo boyfriend, my sister\'s 21st birthday, grandson\'s bar mitzvah...">' + esc(ai.prompt || '') + '</textarea>' +
          '<button type="button" class="wb-btn wb-gen" data-act="gen-ai"' + (ai.loading ? ' disabled' : '') + '>' + (ai.loading ? 'Generating…' : 'Generate designs') + '</button>';
        if (ai.loading) h += '<p class="wb-ai-status">Creating 3 custom designs… this can take 1–2 minutes.</p>';
        var designs = (ai.designs && ai.designs.length) ? ai.designs : (w.aiDesign ? [w.aiDesign] : []);
        if (designs.length) {
          h += '<div class="wb-designs">' + designs.map(function (d, i) {
            var sel = ai.picked === i || (ai.picked == null && w.aiDesign && w.aiDesign.title === d.title);
            var img = d.imageUrl || d.gcsUrl || '';
            return '<label class="wb-design' + (sel ? ' wb-design-on' : '') + '" data-act="pick-ai" data-i="' + i + '">' +
              '<span class="wb-design-head"><input type="radio" name="wb-ai" ' + (sel ? 'checked' : '') + '>' +
              '<span><span class="wb-design-title">' + esc(d.title || ('Design ' + (i + 1))) + '</span>' +
              (d.description ? '<span class="wb-design-desc">' + esc(d.description) + '</span>' : '') +
              '</span></span>' +
              (img ? '<img src="' + esc(img) + '" alt="">' : '') +
              '</label>';
          }).join('') + '</div>';
        }
        if (ai.designs && ai.designs.length && !ai.loading) h += '<p class="wb-ai-status">Pick your favorite design above.</p>';
        h += '</div>';
      }
    }
    h += '</div>';
    var fl = w.flowers;
    h += '<section class="wb-flower-sec"><label class="wb-flowers-label"><input type="checkbox" id="wb-flowers"' + (fl || S.flowersOpen ? ' checked' : '') + '> Add flowers</label>';
    if (!S.flowers) h += '<p class="wb-flower-msg">Finding a lovely bouquet with your gift…</p>';
    else if (S.flowers.status !== 'ok' || !S.flowers.choices.length) h += '<p class="wb-flower-msg">' + esc(S.flowers.message || 'We apologize — floral delivery is not currently available for this ZIP code. Gift wrapping is still available.') + '</p>';
    else {
      h += '<p class="wb-flower-lead">Choose a bouquet to send with this gift.</p><div class="wb-grid wb-flowers">' + S.flowers.choices.map(function (c) {
        var on = fl && fl.offerId === c.offerId;
        return '<label class="wb-flower' + (on ? ' wb-flower-on' : '') + '" data-act="pick-flower" data-offer="' + esc(c.offerId) + '">' +
          '<input type="radio" name="wb-flower"' + (on ? ' checked' : '') + '>' +
          '<img src="' + esc(c.imageUrl) + '" alt="' + esc(c.title) + '">' +
          '<span class="wb-flower-price">' + usdNum(c.price) + '</span>' +
          '<span class="wb-flower-name">' + esc(c.title) + '</span></label>';
      }).join('') + '</div>';
      if (S.flowers.disclaimer || S.flowers.source === 'classic_backup') {
        h += '<p class="wb-flower-note">Actual bouquets might differ slightly from the photos shown.</p>';
      }
    }
    h += '</section><div class="wb-note-sec"><label class="wb-msg-label" for="wb-msg">Gift message</label>' +
      '<textarea class="wb-input wb-msg" id="wb-msg" maxlength="300" rows="2" placeholder="A note for your giftee">' + esc(w.giftMessage || '') + '</textarea>' +
      '<label class="wb-msg-label" for="wb-from">From</label>' +
      '<input class="wb-input wb-from" id="wb-from" maxlength="80" placeholder="Your name" value="' + esc(w.senderName || '') + '"></div>' +
      (S.error ? '<p class="wb-error">' + esc(S.error) + '</p>' : '') +
      '</div>' + wrapNav(true) + '</div></div>';
    return h;
    function radio(v, label, note) {
      return '<label class="wb-radio"><input type="radio" name="wb-style" value="' + v + '"' + (style === v ? ' checked' : '') + '> <span>' + esc(label) + '</span>' +
        (note ? '<span class="wb-price-note">' + esc(note) + '</span>' : '') + '</label>';
    }
  }

  function viewReview() {
    var b = S.batch;
    var h = '<section class="wb-card wb-review">' + (b.bill ? billBlock(b.bill) : '<p class="wb-error">' + esc(b.billError || 'Your total is being prepared.') + '</p>') + '</section>';
    h += '<p class="wb-review-note">When you click Pay, we check the latest prices with each store one more time.</p>';
    if (S.error) h += '<p class="wb-error">' + esc(S.error) + '</p>';
    h += '<div class="wb-actions"><button type="button" class="wb-btn wb-btn-ghost" data-act="review-back">Edit gift-wrap</button>' +
      '<button type="button" class="wb-btn" data-act="pay"' + (b.bill && !S.busy ? '' : ' disabled') + '>Pay Wrrapd</button></div>';
    return h;
  }

  function viewPaid() {
    return '<section class="wb-card wb-center"><h2>Thank you!</h2><p>Your order number is <b>' + esc(S.batch.orderNumber || S.batch.id) + '</b>.</p><p>Your order is in. We are gift-wrapping your items and delivering them.</p>' +
      (S.batch.manualPending ? '<p>We are adding your other item by hand. We will email you to approve it.</p>' : '') +
      '<button type="button" class="wb-btn wb-btn-ghost wb-start-over" data-act="start-over">Start over</button></section>';
  }

  /* ---------- actions ---------- */
  root.addEventListener('click', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('wb-modal') && e.target.querySelector('.wb-wrap-modal')) {
      S.wrapOpen = false;
      S.flowersOpen = false;
      render();
      return;
    }
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !root.contains(el) || el.disabled) return;
    onAct({ currentTarget: el, preventDefault: function () { e.preventDefault(); } });
  });

  function bind() {
    var zipEdit = $('#wb-zip-edit');
    if (zipEdit) zipEdit.addEventListener('change', onZip);
    $all('.wb-manual').forEach(function (box) {
      box.addEventListener('mouseleave', function () {
        S.manualShut = '';
        box.classList.remove('wb-manual-shut');
        if (!S.manualEmailFor) box.classList.remove('wb-manual-open');
      });
    });
    $all('[data-ship]').forEach(function (el) { el.addEventListener('change', onShip); });
    $all('[data-variant]').forEach(function (el) {
      el.addEventListener('change', function () { S.variantDraft[el.getAttribute('data-variant') + '|' + el.getAttribute('data-group')] = el.value; });
    });
    $all('input[name="wb-style"]').forEach(function (el) {
      el.addEventListener('change', function () { saveDraft(); currentLine().wrap = Object.assign({}, currentLine().wrap || {}, { style: el.value, done: false }); render(); });
    });
    var occSel = $('#wb-occ');
    if (occSel) occSel.addEventListener('change', function () { S.occBad = false; saveDraft(); });
    var flw = $('#wb-flowers');
    if (flw) flw.addEventListener('change', function () { saveDraft(); onFlowersToggle(flw.checked); });
    var file = $('#wb-file');
    if (file) file.addEventListener('change', function () { saveDraft(); onUpload(file.files && file.files[0]); });
    var startZip = $('#wb-zip');
    if (startZip) startZip.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); submitStartZip(); }
    });
    var cartZip = $('#wb-zip-edit');
    if (cartZip) cartZip.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); onZip(); }
    });
    var body = document.getElementById('wb-terms-body');
    if (body) {
      var check = function () {
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - 24) {
          S.termsScrolled = true;
          var ag = document.getElementById('wb-agree');
          if (ag) ag.disabled = false;
          var hint = document.getElementById('wb-scroll-hint');
          if (hint) hint.style.display = 'none';
        }
      };
      body.addEventListener('scroll', check);
      check();
      var syncAccept = function () {
        var ag = document.getElementById('wb-agree');
        var el = document.getElementById('wb-elec');
        document.getElementById('wb-accept').disabled = !(ag && ag.checked && (!el || el.checked));
      };
      document.getElementById('wb-agree').addEventListener('change', syncAccept);
      var elec = document.getElementById('wb-elec');
      if (elec) elec.addEventListener('change', syncAccept);
    }
  }

  function currentLine() { return wrapTargets()[S.wrapIndex]; }

  function wrapNav(canSave) {
    var lines = wrapTargets();
    var last = S.wrapIndex + 1 >= lines.length;
    var back = S.wrapIndex > 0
      ? '<button type="button" class="wb-btn wb-btn-ghost" data-act="wrap-back">← Back</button>'
      : '';
    var save = canSave
      ? '<button type="button" class="wb-btn" data-act="wrap-save"' + (S.busy ? ' disabled' : '') + '>' + (last ? 'Save choices' : 'Next →') + '</button>'
      : '';
    return '<div class="wb-wrap-actions"><button type="button" class="wb-btn wb-btn-ghost" data-act="wrap-close">Cancel</button>' + back + save + '</div>';
  }

  function saveDraft() {
    var l = currentLine();
    if (!l) return;
    var w = Object.assign({}, l.wrap || {});
    var occ = $('#wb-occ');
    if (occ) w.occasion = occ.value;
    var hint = $('#wb-hint');
    if (hint) w.wrrapdHint = hint.value;
    var msg = $('#wb-msg');
    if (msg) w.giftMessage = msg.value;
    var from = $('#wb-from');
    if (from) w.senderName = from.value;
    var prompt = $('#wb-ai-prompt');
    if (prompt) {
      S.ai[l.id] = S.ai[l.id] || {};
      S.ai[l.id].prompt = prompt.value;
    }
    l.wrap = w;
  }

  function onAct(e) {
    var el = e.currentTarget;
    var act = el.getAttribute('data-act');
    S.error = '';
    if (act === 'qty-up' || act === 'qty-down') {
      var id = el.getAttribute('data-line');
      var row = S.batch && S.batch.lines.filter(function (x) { return x.id === id; })[0];
      if (!row) return;
      return setQty(id, qtyOf(row) + (act === 'qty-up' ? 1 : -1));
    }
    if (act === 'manual-open') {
      var box = el.closest('.wb-manual');
      S.manualShut = '';
      if (box) { box.classList.remove('wb-manual-shut'); box.classList.toggle('wb-manual-open'); }
      return;
    }
    if (act === 'manual-no') {
      var shut = el.closest('.wb-manual');
      S.manualShut = el.getAttribute('data-line');
      if (shut) { shut.classList.remove('wb-manual-open'); shut.classList.add('wb-manual-shut'); }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (S.manualEmailFor) { S.manualEmailFor = ''; render(); }
      return;
    }
    if (act === 'manual-yes') {
      var mid = el.getAttribute('data-line');
      var ml = S.batch.lines.filter(function (x) { return x.id === mid; })[0];
      if (!ml) return;
      if (onlyItem(ml)) {
        S.manualEmailFor = mid;
        render();
        var em = $('#wb-manual-email');
        if (em) em.focus();
        return;
      }
      return askManual(mid, '');
    }
    if (act === 'manual-send') {
      var email = (($('#wb-manual-email') || {}).value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { S.error = 'Please enter a valid email.'; render(); var again = $('#wb-manual-email'); if (again) { again.value = email; again.focus(); } return; }
      return askManual(el.getAttribute('data-line'), email);
    }
    if (act === 'modal-zip') return submitModalZip();
    if (act === 'start-zip') return submitStartZip();
    if (act === 'cart-zip') return onZip();
    if (act === 'start-over') return startOver();
    if (act === 'add-more') { S.addOpen = true; render(); return; }
    if (act === 'submit-links') return submitLinks();
    if (act === 'remove') return removeLine(el.getAttribute('data-line'));
    if (act === 'pick-variant') return pickVariant(el);
    if (act === 'variant') return submitVariant(el.getAttribute('data-line'));
    if (act === 'open-wrap') return openWrap();
    if (act === 'to-review') {
      if (needsTermsGate()) { openTermsThen('review'); return; }
      S.view = 'review'; S.wrapOpen = false; render(); return;
    }
    if (act === 'close-terms') {
      S.termsOpen = false; S.wrapOpen = false; S.pendingAfterTerms = '';
      render(); return;
    }
    if (act === 'accept') return accept();
    if (act === 'wrap-close') { S.wrapOpen = false; S.flowersOpen = false; render(); return; }
    if (act === 'wrap-back') {
      saveDraft();
      var backLine = currentLine();
      var backWrap = backLine && backLine.wrap;
      if (backWrap && (backWrap.style || 'wrrapd') === 'wrrapd' && !backWrap.occasion) {
        S.occBad = true;
        S.error = 'Please choose an occasion.';
        render();
        var backSel = $('#wb-occ');
        if (backSel) backSel.focus();
        return;
      }
      if (S.wrapIndex > 0) { S.wrapIndex--; S.flowersOpen = false; }
      render();
      return;
    }
    if (act === 'wrap-save') return saveWrap();
    if (act === 'review-back') { S.view = 'items'; S.wrapOpen = true; S.wrapIndex = Math.max(0, wrapTargets().length - 1); render(); return; }
    if (act === 'to-pay' || act === 'pay') return payWrrapd();
    if (act === 'gen-ai') return genAi();
    if (act === 'pick-ai') { saveDraft(); var ai = S.ai[currentLine().id]; ai.picked = Number(el.getAttribute('data-i')); render(); return; }
    if (act === 'pick-flower') { e.preventDefault(); return pickFlower(el.getAttribute('data-offer')); }
  }

  function keepLinks(fn) {
    var vals = $all('.wb-link').map(function (i) { return i.value; });
    var zip = ($('#wb-zip') || {}).value || '';
    fn();
    render();
    $all('.wb-link').forEach(function (i, n) { if (vals[n]) i.value = vals[n]; });
    if ($('#wb-zip')) $('#wb-zip').value = zip;
  }

  function filledLinks() {
    return $all('.wb-link').map(function (i) { return i.value.trim(); }).filter(Boolean);
  }
  function submitLinks() {
    if (!S.id) return create();
    var links = filledLinks();
    if (!links.length) { if (visibleLines().length) return; S.error = 'Please paste at least one product link.'; render(); return; }
    S.busy = true;
    S.draftLinks = links;
    render();
    request('/api/buy/batches/' + encodeURIComponent(S.id) + '/link', { links: links }).then(function (j) {
      S.busy = false;
      S.draftLinks = null;
      S.addOpen = false;
      S.payRefreshId = '';
      S.batch = j.batch;
      S.notice = stillNeedsWrap() ? 'Please gift-wrap the new item.' : (j.notice || '');
      if (!stillNeedsWrap()) S.promptedWrap = '';
      render();
      forceWrapPrompt();
      poll();
    }).catch(function (err) {
      S.busy = false;
      S.error = err.message;
      S.draftLinks = links;
      render();
    });
  }
  function pendingWrapLine() {
    return ((S.batch && S.batch.lines) || []).find(function (l) {
      return l.forceWrap && l.state === 'ready' && !(l.wrap && l.wrap.done);
    }) || null;
  }
  function stillNeedsWrap() {
    return ((S.batch && S.batch.lines) || []).some(function (l) {
      return l.state !== 'removed' && l.state !== 'unavailable' && !(l.wrap && l.wrap.done);
    });
  }
  function clearWrapNotice() {
    if (S.notice === 'Please gift-wrap the new item.' && !stillNeedsWrap()) {
      S.notice = '';
      S.promptedWrap = '';
    }
  }
  function forceWrapPrompt() {
    var line = pendingWrapLine();
    if (!line) { clearWrapNotice(); return; }
    S.notice = 'Please gift-wrap the new item.';
    if (S.wrapOpen || S.promptedWrap === line.id) return;
    S.promptedWrap = line.id;
    openWrap();
  }
  function openWrap() {
    var lines = wrapTargets();
    if (!lines.length) return;
    var idx = lines.findIndex(function (l) { return !(l.wrap && l.wrap.done); });
    S.wrapIndex = idx < 0 ? 0 : idx;
    S.flowersOpen = false;
    if (needsTermsGate()) {
      openTermsThen('wrap');
      return;
    }
    S.termsOpen = false;
    S.wrapOpen = true;
    render();
  }
  function create() {
    var zip = ($('#wb-zip').value || '').replace(/\D/g, '');
    var links = filledLinks();
    if (zip.length !== 5) { S.error = 'Please enter the giftee’s 5-digit ZIP code.'; return keepLinks(function () {}); }
    if (!links.length) { S.error = 'Please paste at least one product link.'; return keepLinks(function () {}); }
    S.busy = true;
    keepLinks(function () {});
    request('/api/buy/batches', { preview: preview, gifteeZip: zip, links: links }).then(function (j) {
      S.busy = false;
      S.id = j.id;
      S.token = j.token;
      S.batch = j.batch;
      S.notice = j.notice || '';
      S.view = 'items';
      setUrl();
      loadPricing();
      render();
      poll();
    }).catch(function (err) {
      S.busy = false;
      S.error = err.message;
      keepLinks(function () {});
    });
  }

  function loadPricing() {
    if (!S.batch) return;
    fetch(API + '/api/pricing-preview?postalCode=' + encodeURIComponent(S.batch.gifteeZip))
      .then(function (r) { return r.json(); })
      .then(function (j) { S.pricing = j; if (S.view === 'wrap' || S.wrapOpen) render(); })
      .catch(function () {});
  }

  function busyLines() {
    var b = S.batch;
    return stillWorking() && b.lines.some(function (l) { return l.state === 'reading' || l.state === 'quoting'; });
  }
  function needsPoll() {
    var b = S.batch;
    if (!b || b.status !== 'open') return false;
    return busyLines() || !!b.manualPending;
  }

  function poll() {
    clearTimeout(S.pollTimer);
    if (!needsPoll()) return;
    var wait = busyLines() ? 4000 : 20000;
    S.pollTimer = setTimeout(function () {
      var id = S.id;
      if (!id) return;
      request('/api/buy/batches/' + encodeURIComponent(id)).then(function (j) {
        if (S.id !== id) return;
        S.batch = j.batch;
        if (S.busy) { poll(); return; }
        if (S.view === 'items' || S.wrapOpen) {
          var active = document.activeElement;
          var typing = active && root.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
          if (!typing) {
            if (S.wrapOpen && !S.termsOpen) saveDraft();
            render();
            forceWrapPrompt();
          }
        }
        poll();
      }).catch(function () { poll(); });
    }, wait);
  }

  function submitModalZip() {
    saveDraft();
    var el = $('#wb-modal-zip');
    if (!el || !S.batch) return;
    var zip = (el.value || '').replace(/\D/g, '').slice(0, 5);
    el.value = zip;
    if (zip.length !== 5) {
      S.modalZipOk = false;
      S.error = 'Please enter a valid 5-digit ZIP code.';
      render();
      return;
    }
    if (zip === S.batch.gifteeZip) {
      S.modalZipOk = true;
      S.error = '';
      render();
      return;
    }
    S.zipChecking = true;
    S.modalZipOk = false;
    S.error = '';
    render();
    change('/zip', { gifteeZip: zip }).then(function () {
      S.zipChecking = false;
      S.modalZipOk = true;
      S.flowers = null;
      S.flowersLoading = false;
      loadPricing();
      render();
    }).catch(function () {
      S.zipChecking = false;
      render();
    });
  }

  function submitStartZip() {
    var el = $('#wb-zip');
    if (!el) return;
    var zip = String(el.value || '').replace(/\D/g, '').slice(0, 5);
    S.startZip = zip;
    if (zip.length !== 5) {
      S.startZipOk = false;
      S.error = 'Please enter a valid 5-digit ZIP code.';
      render();
      var again = $('#wb-zip');
      if (again) again.focus();
      return;
    }
    var wasOk = S.startZipOk;
    S.startZipOk = true;
    S.error = '';
    render();
    if (!wasOk) {
      var first = root.querySelector('.wb-link');
      if (first) first.focus();
    }
  }

  function onZip() {
    var el = $('#wb-zip-edit');
    if (!el || !S.batch) return;
    var zip = (el.value || '').replace(/\D/g, '').slice(0, 5);
    if (zip === S.batch.gifteeZip) return;
    if (zip.length !== 5) { S.error = 'Please enter the giftee’s 5-digit ZIP code.'; render(); return; }
    change('/zip', { gifteeZip: zip }).then(function () { loadPricing(); });
  }

  function addItem() {
    var el = $('#wb-add-link');
    var url = el ? el.value.trim() : '';
    if (!url) { S.error = 'Please paste a product link.'; render(); return; }
    change('/link', { url: url });
  }

  function setQty(lineId, raw) {
    var n = Math.round(Number(raw));
    if (!(n >= 1 && n <= maxQty())) { render(); return; }
    var l = S.batch.lines.filter(function (x) { return x.id === lineId; })[0];
    if (!l || qtyOf(l) === n) return;
    l.qty = n;
    render();
    change('/qty', { lineId: lineId, qty: n }).catch(function () { render(); });
  }

  function askManual(lineId, email) {
    S.busy = true;
    render();
    return change('/manual', { lineId: lineId, email: email }).then(function () {
      S.busy = false;
      S.manualEmailFor = '';
      render();
    }).catch(function () {
      S.busy = false;
      render();
    });
  }

  function removeLine(lineId) {
    var l = S.batch.lines.filter(function (x) { return x.id === lineId; })[0];
    if (!l || l.state === 'removed') return;
    var was = l.state;
    l.state = 'removed';
    render();
    return change('/remove', { lineId: lineId }).catch(function () { l.state = was; render(); });
  }

  function change(path, body) {
    return request('/api/buy/batches/' + encodeURIComponent(S.id) + path, body).then(function (j) {
      S.batch = j.batch;
      S.notice = j.notice || '';
      render();
      poll();
      return j;
    }).catch(function (err) {
      S.error = err.message;
      render();
      throw err;
    });
  }

  function onShip(e) {
    var el = e.currentTarget;
    change('/shipping', { retailer: el.getAttribute('data-ship'), optionId: el.value }).catch(function () {});
  }

  function variantChoices(lineId) {
    var l = S.batch.lines.filter(function (x) { return x.id === lineId; })[0];
    var choices = {};
    var ready = true;
    if (!l || !l.product) return { choices: choices, ready: false };
    (l.product.variantGroups || []).forEach(function (vg) {
      var picked = S.variantDraft[lineId + '|' + vg.name] || (vg.options.indexOf(vg.selected) >= 0 ? vg.selected : '');
      choices[vg.name] = picked;
      if (!picked) ready = false;
    });
    return { choices: choices, ready: ready };
  }
  function pickVariant(el) {
    var lineId = el.getAttribute('data-line');
    var group = el.getAttribute('data-group');
    S.variantDraft[lineId + '|' + group] = el.getAttribute('data-value');
    var picked = variantChoices(lineId);
    if (!picked.ready) { render(); return; }
    change('/variant', { lineId: lineId, choices: picked.choices }).catch(function () {});
  }
  function submitVariant(lineId) {
    var picked = variantChoices(lineId);
    if (!picked.ready) { S.error = 'Please choose one.'; render(); return; }
    change('/variant', { lineId: lineId, choices: picked.choices }).catch(function () {});
  }

  function accept() {
    var elec = document.getElementById('wb-elec');
    var next = S.pendingAfterTerms || 'wrap';
    change('/accept', {
      version: S.terms.version,
      scrolledToEnd: !!S.termsScrolled,
      agreed: !!(document.getElementById('wb-agree') || {}).checked,
      electronicsAccepted: elec ? elec.checked : false,
    }).then(function () {
      S.termsOpen = false;
      S.pendingAfterTerms = '';
      S.view = 'items';
      if (next === 'pay') {
        S.wrapOpen = false;
        render();
        payWrrapd();
        return;
      }
      if (next === 'review') {
        S.wrapOpen = false;
        S.view = 'review';
        render();
        return;
      }
      var lines = wrapTargets();
      var idx = lines.findIndex(function (l) { return !(l.wrap && l.wrap.done); });
      S.wrapIndex = idx < 0 ? 0 : idx;
      S.wrapOpen = true;
      render();
    }).catch(function () {});
  }

  function ensureFlowers() {
    if (S.flowers || S.flowersLoading) return;
    var zip = S.batch && S.batch.gifteeZip;
    if (!zip) return;
    S.flowersLoading = true;
    fetch(API + '/api/flowers/catalog?postalCode=' + encodeURIComponent(zip))
      .then(function (r) { return r.json(); })
      .then(function (j) { S.flowers = j || { status: 'unavailable', choices: [] }; })
      .catch(function () { S.flowers = { status: 'unavailable', choices: [] }; })
      .then(function () {
        S.flowersLoading = false;
        if (S.wrapOpen) render();
      });
  }

  function onFlowersToggle(on) {
    var l = currentLine();
    S.flowersOpen = on;
    if (!on) { l.wrap = Object.assign({}, l.wrap || {}, { flowers: null }); render(); return; }
    ensureFlowers();
    render();
  }

  function pickFlower(offerId) {
    saveDraft();
    var c = (S.flowers.choices || []).filter(function (x) { return x.offerId === offerId; })[0];
    if (!c) return;
    var l = currentLine();
    S.flowersOpen = true;
    l.wrap = Object.assign({}, l.wrap || {}, { flowers: { offerId: c.offerId, amount: c.price, imageUrl: c.imageUrl, title: c.title } });
    var box = root.querySelector('#wb-flowers');
    if (box) box.checked = true;
    $all('.wb-flower').forEach(function (el) {
      var on = el.getAttribute('data-offer') === offerId;
      el.classList.toggle('wb-flower-on', on);
      var radio = el.querySelector('input[type="radio"]');
      if (radio) radio.checked = on;
    });
    S.lastHtml = '';
  }

  function genAi() {
    saveDraft();
    var l = currentLine();
    var prompt = ((S.ai[l.id] && S.ai[l.id].prompt) || '').trim();
    if (!prompt) {
      var box = $('#wb-ai-prompt');
      if (box) box.focus();
      return;
    }
    S.ai[l.id] = { loading: true, prompt: prompt };
    render();
    fetch(API + '/generate-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occasion: prompt, productTitle: l.product.title, retailer: l.retailerName }),
    }).then(function (r) { return r.text(); }).then(function (raw) {
      var d = raw;
      try { d = JSON.parse(raw); } catch (e) { d = {}; }
      if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (e2) { d = {}; }
      }
      S.ai[l.id] = { designs: (d && d.designs) || [], picked: null, prompt: prompt };
      if (!S.ai[l.id].designs.length) S.error = 'Could not generate designs — please try again.';
      render();
    }).catch(function () {
      S.ai[l.id] = { prompt: prompt };
      S.error = 'Could not generate designs — please try again.';
      render();
    });
  }

  function saveAiChoice(l) {
    var ai = S.ai[l.id];
    if (!ai || ai.picked == null) {
      if (l.wrap && l.wrap.aiDesign && l.wrap.aiDesign.filePath) return Promise.resolve(l.wrap.aiDesign);
      return Promise.reject(new Error('Please choose one of the AI designs.'));
    }
    var d = ai.designs[ai.picked];
    return fetch(API + '/api/save-ai-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: d.imageBase64 || undefined,
        imageUrl: d.imageBase64 ? undefined : d.imageUrl,
        designTitle: d.title,
        designDescription: d.description,
        orderNumber: S.id,
        itemTitle: l.product.title,
        asin: '',
        index: ai.picked,
        shouldUpscale: true,
        folder: 'designs',
      }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.filePath) throw new Error('We could not save that design. Please try again.');
      return { filePath: j.filePath, title: d.title, description: d.description };
    });
  }

  function onUpload(file) {
    var l = currentLine();
    if (!file) return;
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) < 0) { S.error = 'Please choose a JPG, PNG, or WEBP image.'; render(); return; }
    if (file.size > 5 * 1024 * 1024) { S.error = 'Please choose an image up to 5 MB.'; render(); return; }
    var reader = new FileReader();
    reader.onload = function () {
      S.previews = S.previews || {};
      if (typeof reader.result === 'string') S.previews[l.id] = reader.result;
      if ($('#wb-file')) render();
    };
    reader.readAsDataURL(file);
    var ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    var name = S.id + '-' + l.id + '-' + Date.now() + '.' + ext;
    S.busy = true;
    render();
    fetch(API + '/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: name, contentType: file.type, fileSize: file.size }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.signedUrl) throw new Error('Upload is not available right now.');
      return fetch(j.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).then(function (r) {
        if (!r.ok) throw new Error('Upload did not finish. Please try again.');
        return j.filePath;
      });
    }).then(function (filePath) {
      S.busy = false;
      l.wrap = Object.assign({}, l.wrap || {}, { upload: { filePath: filePath, fileName: file.name } });
      render();
    }).catch(function (err) {
      S.busy = false;
      S.error = err.message || 'Upload did not finish. Please try again.';
      render();
    });
  }

  function waitRefresh() {
    var started = Date.now();
    function tick() {
      return request('/api/buy/batches/' + encodeURIComponent(S.id)).then(function (j) {
        S.batch = j.batch;
        if (S.batch.refresh && S.batch.refresh.state === 'done') return S.batch.refresh;
        if (Date.now() - started > 10 * 60 * 1000) throw new Error('Please try again.');
        return new Promise(function (r) { setTimeout(r, 2500); }).then(tick);
      });
    }
    return tick();
  }

  function payWrrapd() {
    if (S.busy || !S.batch || !S.batch.bill) return;
    if (needsTermsGate()) {
      openTermsThen('pay');
      return;
    }
    var popup = openPayWindow();
    if (!popup) {
      window.alert('Please allow popups for wrrapd.com so you can complete your Wrrapd payment.');
      return;
    }
    var r = S.batch.refresh;
    var fresh = r && r.state === 'done' && r.id === S.payRefreshId && Date.now() - Date.parse(r.doneAt) < 9 * 60 * 1000;
    S.busy = true;
    S.error = '';
    S.notice = fresh ? '' : 'Checking the latest prices…';
    render();
    var ready = fresh ? Promise.resolve(r) : request('/api/buy/batches/' + encodeURIComponent(S.id) + '/refresh', {}).then(function (j) {
      S.batch = j.batch;
      return waitRefresh();
    });
    ready.then(function () {
      r = S.batch.refresh;
      S.busy = false;
      if (popup.closed) { render(); return; }
      if (!S.batch.bill) throw new Error((r && r.error) || S.batch.billError || 'We can’t buy these items right now.');
      if (!fresh && r.changed) {
        try { popup.close(); } catch (e) { /* already closed */ }
        S.payRefreshId = r.id;
        S.notice = 'Please review the new total, then click Pay Wrrapd.';
        render();
        return;
      }
      S.payRefreshId = r.id;
      var payload = {
        buy: true,
        batchId: S.id,
        token: S.token,
        orderNumber: S.id,
        total: S.batch.bill.totalCents,
        billHash: r.billHash,
        termsVersion: S.terms && S.terms.version,
        address: { postalCode: S.batch.gifteeZip, country: 'US' },
        gifteeOriginalAddress: { postalCode: S.batch.gifteeZip, country: 'US' },
      };
      var url = 'https://pay.wrrapd.com/checkout/buy?data=' + encodeURIComponent(btoa(JSON.stringify(payload)));
      try {
        popup.location.href = url;
        popup.focus();
      } catch (e) { /* popup closed */ }
      watchPaid();
      render();
    }).catch(function (err) {
      S.busy = false;
      S.notice = '';
      S.error = err.message || 'Please try again.';
      try { popup.close(); } catch (e) { /* already closed */ }
      if (/agree to the Terms|electronics sentence/i.test(String(err.message || ''))) {
        openTermsThen('pay');
        return;
      }
      render();
    });
  }

  function openPayWindow() {
    var w = 480;
    var hgt = 820;
    var sx = window.screenX !== undefined ? window.screenX : window.screenLeft;
    var sy = window.screenY !== undefined ? window.screenY : window.screenTop;
    var left = sx + (window.innerWidth - w) / 2;
    var top = sy + (window.innerHeight - hgt) / 2;
    var popup = window.open(
      'about:blank',
      'WrrapdPaymentBuy',
      'width=' + w + ',height=' + hgt + ',left=' + left + ',top=' + top + ',scrollbars=yes,resizable=yes'
    );
    if (!popup) return null;
    try {
      popup.document.write('<title>Wrrapd payment</title><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#334155;">Loading Wrrapd secure payment…</body>');
    } catch (e) { /* navigation still works */ }
    return popup;
  }

  function watchPaid() {
    var tries = 0;
    function tick() {
      if (!S.id || tries++ > 150) return;
      request('/api/buy/batches/' + encodeURIComponent(S.id)).then(function (j) {
        S.batch = j.batch;
        if (S.batch.status === 'paid' || S.batch.status === 'closed') {
          S.view = 'paid';
          S.wrapOpen = false;
          S.busy = false;
          render();
          return;
        }
        setTimeout(tick, 4000);
      }).catch(function () { setTimeout(tick, 4000); });
    }
    setTimeout(tick, 4000);
  }

  function saveWrap() {
    saveDraft();
    var l = currentLine();
    var w = l.wrap || {};
    var style = w.style || 'wrrapd';
    if (style === 'wrrapd' && !w.occasion) {
      S.occBad = true;
      S.error = 'Please choose an occasion.';
      render();
      var sel = $('#wb-occ');
      if (sel) sel.focus();
      return;
    }
    S.occBad = false;
    if (style === 'upload' && !(w.upload && w.upload.filePath)) { S.error = 'Please upload your design.'; render(); return; }
    if (S.flowersOpen && !w.flowers) { S.error = 'Please select a bouquet, or uncheck Add flowers.'; render(); return; }
    S.busy = true;
    render();
    var designP = style === 'ai' ? saveAiChoice(l) : Promise.resolve(null);
    designP.then(function (aiDesign) {
      var payload = { occasion: style === 'wrrapd' ? w.occasion : '', style: style, giftMessage: w.giftMessage || '', senderName: w.senderName || '', wrrapdHint: style === 'wrrapd' ? (w.wrrapdHint || '') : '', combine: false, combineNote: '' };
      if (aiDesign) payload.aiDesign = aiDesign;
      if (style === 'upload') payload.upload = w.upload;
      if (w.flowers) payload.flowers = w.flowers;
      return request('/api/buy/batches/' + encodeURIComponent(S.id) + '/wrap', { lineId: l.id, wrap: payload });
    }).then(function (j) {
      S.busy = false;
      S.batch = j.batch;
      S.flowersOpen = false;
      clearWrapNotice();
      var lines = wrapTargets();
      if (S.wrapIndex + 1 < lines.length) S.wrapIndex++;
      else { S.wrapOpen = false; S.view = 'items'; }
      render();
    }).catch(function (err) {
      S.busy = false;
      S.error = err.message;
      if (/agree to the Terms|electronics sentence/i.test(String(err.message || ''))) {
        openTermsThen('wrap');
        return;
      }
      render();
    });
  }

  /* ---------- start ---------- */
  function start() {
    // Full page load only: re-try every Excluded item (server flips unavailable → reading).
    var batchP = (S.id && S.token)
      ? request('/api/buy/batches/' + encodeURIComponent(S.id) + '?retryExcluded=1').catch(function () { return null; })
      : Promise.resolve(null);
    if (S.id && S.token) {
      root.innerHTML = '<div class="wb-wrap"><p class="wb-muted">Loading your cart…</p></div>';
    }
    batchP.then(function (j) {
      if (!j || !j.batch || S.batch) return;
      S.batch = j.batch;
      S.view = (j.batch.status === 'paid' || j.batch.status === 'closed') ? 'paid' : 'items';
      S.lastHtml = '';
      render();
    });
    Promise.all([
      fetch(API + '/api/buy/config?preview=' + encodeURIComponent(preview)).then(function (r) { return r.json(); }),
      fetch(API + '/api/buy/terms').then(function (r) { return r.json(); }),
      batchP,
    ]).then(function (res) {
      S.config = res[0];
      S.terms = res[1];
      if (!S.id || !S.token) { render(); return; }
      var j = res[2];
      if (!j || !j.batch) {
        S.id = '';
        S.token = '';
        S.batch = null;
        S.view = 'start';
        history.replaceState(null, '', location.pathname);
        render();
        return;
      }
      S.batch = j.batch;
      S.view = (j.batch.status === 'paid' || j.batch.status === 'closed') ? 'paid' : 'items';
      S.lastHtml = '';
      loadPricing();
      render();
      forceWrapPrompt();
      poll();
    }).catch(function () {
      root.innerHTML = '<div class="wb-wrap"><p class="wb-error">This page could not load. Please refresh.</p></div>';
    });
  }
  start();
})();

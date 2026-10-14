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
    busy: false,
    linkCount: 1,
    flowers: null,
    ai: {},
    variantDraft: {},
  };

  var TRASH_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

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
    history.replaceState(null, '', u.toString());
  }

  function extLine() {
    return '<p class="wb-ext-line">Prefer to buy it yourself and have us gift-wrap? Simply add the free <a href="' + esc(EXT) + '" target="_blank" rel="noopener">Wrrapd Chrome extension</a> and select us for gift-wrapping at retailer checkout.</p>';
  }

  /* ---------- views ---------- */
  function render() {
    var html = '';
    if (S.view === 'start') html = viewStart();
    else if (S.view === 'items') html = viewItems();
    else if (S.view === 'wrap') html = viewWrap();
    else if (S.view === 'review') html = viewReview();
    else if (S.view === 'paid') html = viewPaid();
    var next = '<div class="wb-wrap">' + html + '</div>' + (S.termsOpen ? viewTerms() : '');
    if (next === S.lastHtml) return;
    S.lastHtml = next;
    root.innerHTML = next;
    bind();
  }

  function viewStart() {
    var open = S.config && S.config.open;
    var stores = S.config ? S.config.retailers.map(function (r) { return r.name; }).join(', ') : '';
    var h = '<section class="wb-hero"><h1>We buy it. We wrap it. We deliver it.</h1><p>Pick how you would like to send your gift.</p></section>';
    h += '<section class="wb-options">' +
      '<div class="wb-option"><h2>Buy it yourself</h2><p>Shop at the store and add gift-wrap at checkout with the free Wrrapd Chrome extension.</p>' +
      '<a class="wb-btn wb-btn-ghost" href="' + esc(EXT) + '" target="_blank" rel="noopener">Get the extension</a></div>' +
      '<div class="wb-option wb-option-main"><h2>We buy it for you</h2><p>Paste up to ' + esc(S.config ? S.config.maxLinks : 5) + ' product links. We buy the items, gift-wrap every one, and deliver them.</p>' +
      (open ? '<a class="wb-btn" href="#wb-start">Start</a>' : '<p class="wb-soon">Coming soon.</p>') + '</div></section>';
    if (!open) return h;
    var links = '';
    for (var i = 0; i < S.linkCount; i++) {
      links += '<input class="wb-input wb-link" type="url" inputmode="url" placeholder="Paste a product link" aria-label="Product link ' + (i + 1) + '">';
    }
    h += '<section class="wb-card" id="wb-start"><h2>Your gift</h2>' +
      '<div class="wb-zip-row"><label class="wb-label" for="wb-zip">Giftee / gift-recipient\'s zip code:</label>' +
      '<input class="wb-input wb-zip" id="wb-zip" inputmode="numeric" maxlength="5" autocomplete="off"></div>' +
      '<label class="wb-label">Paste the product links for gift-wrapping below.</label><div class="wb-links">' + links + '</div>' +
      (S.linkCount < S.config.maxLinks ? '<button type="button" class="wb-link-btn" data-act="add-link">+ Add another link</button>' : '') +
      '<p class="wb-stores">' + (S.config ? S.config.retailers.map(function (r) { return '<span>' + esc(r.name) + '</span>'; }).join('') : esc(stores)) + '</p>' +
      (S.error ? '<p class="wb-error">' + esc(S.error) + '</p>' : '') +
      '<button type="button" class="wb-btn" data-act="create"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Checking…' : 'Check my items') + '</button></section>';
    return h;
  }

  function groupFor(retailer) {
    return (S.batch.groups || []).filter(function (g) { return g.retailer === retailer; })[0] || null;
  }

  var WAIT_ADD = 'Please wait while we add that to your gift-wrapping cart…';
  var WAIT_DETAILS = 'Getting additional details…';

  function canEdit() {
    return S.view === 'items' && !(S.batch.refresh && S.batch.refresh.state === 'running');
  }

  function itemCell(l) {
    var title = l.product && l.product.title ? l.product.title : 'Item';
    var img = l.product && l.product.imageUrl ? '<img src="' + esc(l.product.imageUrl) + '" alt="">' : '<span class="wb-img-ph"></span>';
    var h = '<div class="wb-item">' + img + '<div class="wb-item-main">';
    if (l.product) h += '<p class="wb-row-title">' + esc(title) + '</p>';
    else if (l.url) h += '<p class="wb-linkline">' + esc(shortUrl(l.url)) + '</p>';
    if (l.variantLabel) h += '<p class="wb-muted">' + esc(l.variantLabel) + '</p>';
    if (l.product && l.product.isElectronics) h += '<p class="wb-muted">Electronics</p>';
    if (l.state === 'reading') h += '<p class="wb-status"><span class="wb-spin"></span>' + WAIT_ADD + '</p>';
    if (l.state === 'needs_variant') {
      h += '<div class="wb-variants">';
      (l.product.variantGroups || []).forEach(function (vg) {
        h += '<label class="wb-label">' + esc(vg.name) + '</label><select class="wb-input" data-variant="' + esc(l.id) + '" data-group="' + esc(vg.name) + '"><option value="">Choose…</option>' +
          vg.options.map(function (o) { return '<option' + (S.variantDraft[l.id + '|' + vg.name] === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
      });
      h += '<button type="button" class="wb-btn wb-btn-sm" data-act="variant" data-line="' + esc(l.id) + '">Confirm</button></div>';
    }
    if (excluded(l)) h += '<p class="wb-unavailable">' + esc(limitMessage(l)) + '</p>';
    else if (l.state === 'unavailable') h += '<p class="wb-unavailable">' + esc(l.message || "We can't buy this item right now.") + '</p>';
    return h + '</div></div>';
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
    if (s) return (s.arrivalDate ? esc(fmtDate(s.arrivalDate)) : 'date to follow') + '*';
    if (waiting(l)) return '<span class="wb-status"><span class="wb-spin"></span>' + WAIT_DETAILS + '</span>';
    return '—';
  }

  function costCell(l) {
    var s = shipOf(l);
    if (!s) return '—';
    if (s.cents == null) return s.note ? esc(s.note) : '—';
    return s.cents ? usd(s.cents) : 'Free';
  }

  function retailerTable(name, retailer, lines) {
    var edit = canEdit();
    var itemSum = 0;
    var shipSum = 0;
    var shipKnown = false;
    lines.forEach(function (l) {
      if (l.state === 'unavailable') return;
      var c = knownCents(l);
      if (c != null) itemSum += c;
      var s = shipOf(l);
      if (s && s.cents != null) { shipSum += s.cents; shipKnown = true; }
    });
    var h = '<div class="wb-store"><p class="wb-store-name">' + esc(name) + '</p><table class="wb-table"><colgroup>' +
      '<col class="wb-col-item"><col class="wb-col-when"><col class="wb-col-ship"><col class="wb-col-price">' + (edit ? '<col class="wb-col-del">' : '') +
      '</colgroup><thead><tr>' +
      '<th scope="col">Item</th><th scope="col">Expected delivery*</th><th scope="col" class="wb-money">Shipping cost</th><th scope="col" class="wb-money">Price</th>' +
      (edit ? '<th scope="col"><span class="wb-sr">Delete</span></th>' : '') +
      '</tr></thead><tbody>';
    lines.forEach(function (l) {
      h += '<tr class="wb-tr wb-row-' + esc(l.state) + '">' +
        '<td data-label="Item">' + itemCell(l) + '</td>' +
        '<td data-label="Expected delivery">' + (retailer ? deliveryCell(l) : '—') + '</td>' +
        '<td data-label="Shipping cost" class="wb-money wb-shipcost">' + (retailer ? costCell(l) : '—') + '</td>' +
        '<td data-label="Price" class="wb-money">' + priceCell(l) + '</td>';
      if (edit) h += '<td class="wb-del"><button type="button" class="wb-trash" data-act="remove" data-line="' + esc(l.id) + '" aria-label="Delete item" title="Delete item">' + TRASH_SVG + '</button></td>';
      h += '</tr>';
    });
    var tail = edit ? '<td></td>' : '';
    h += '</tbody><tfoot>' +
      '<tr class="wb-foot"><td>Retailer subtotal</td><td></td><td class="wb-money">' + (shipKnown ? usd(shipSum) : '—') + '</td><td class="wb-money">' + usd(itemSum) + '</td>' + tail + '</tr>' +
      '</tfoot></table></div>';
    return h;
  }

  function excluded(l) {
    return l.state === 'unavailable' && l.reason === 'over_item_limit';
  }
  function limitMessage(l) {
    var cap = S.batch && S.batch.limits && S.batch.limits.perItemCapCents;
    var price = l.product && l.product.pagePriceCents;
    if (price && cap) return 'This item is over the purchase limit (' + usd(price) + ' versus ' + usd(cap) + ').';
    return l.message || 'This item is over the purchase limit.';
  }
  function itemTables(lines) {
    var order = [];
    var by = {};
    lines.forEach(function (l) {
      if (excluded(l)) return;
      var key = l.retailerName ? l.retailer : '_other';
      if (!by[key]) { by[key] = []; order.push(key); }
      by[key].push(l);
    });
    return order.map(function (key) {
      var first = by[key][0];
      return key === '_other' ? retailerTable('Other links', null, by[key]) : retailerTable(first.retailerName, first.retailer, by[key]);
    }).join('');
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
  function knownCents(l) {
    var g = groupFor(l.retailer);
    if (l.state === 'ready' && g && g.itemPrices && g.itemPrices[l.id]) return g.itemPrices[l.id];
    if (l.state !== 'unavailable' && l.product && l.product.pagePriceCents) return l.product.pagePriceCents;
    return null;
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
    var ready = readyLines().length;
    var canGo = ready > 0 && !stillWorking() && b.bill;
    var room = lines.length < (S.config ? S.config.maxLinks : 5);
    var h = '<section class="wb-card"><h2>Gift-wrapping shopping cart</h2>' +
      '<div class="wb-zip-row"><label class="wb-label" for="wb-zip-edit">Giftee / gift-recipient\'s zip code:</label>' +
      '<input class="wb-input wb-zip" id="wb-zip-edit" inputmode="numeric" maxlength="5" value="' + esc(b.gifteeZip) + '" autocomplete="off"></div>' +
      extLine() +
      (rows || (excludedHtml ? '' : '<p class="wb-muted">Add a product link to start.</p>')) +
      (rows ? '<p class="wb-asterisk">* Final gift delivery to the giftee may add 1 day.</p>' : '') +
      excludedHtml +
      (rows ? endTotals(lines) : '') +
      (room ? '<p class="wb-ask">Paste the product links for gift-wrapping below.</p><div class="wb-add"><input class="wb-input" id="wb-add-link" type="url" placeholder="Paste a product link" aria-label="Product link"><button type="button" class="wb-btn wb-btn-sm" data-act="add-item">Add</button></div>' : '') +
      '</section>';
    if (!b.bill && b.billError && !stillWorking() && ready) h += '<p class="wb-error">' + esc(b.billError) + '</p>';
    h += limitLine();
    if (S.error) h += '<p class="wb-error">' + esc(S.error) + '</p>';
    h += '<button type="button" class="wb-btn" data-act="to-terms"' + (canGo ? '' : ' disabled') + '>Continue to gift-wrap</button>';
    if (lines.some(function (l) { return l.state === 'reading'; })) h += '<p class="wb-muted">Please keep this page open.</p>';
    return h;
  }
  function endTotals(lines) {
    var itemSum = 0;
    var shipSum = 0;
    lines.forEach(function (l) {
      if (l.state === 'unavailable') return;
      var c = knownCents(l);
      if (c != null) itemSum += c;
      var s = shipOf(l);
      if (s && s.cents != null) shipSum += s.cents;
    });
    var tax = S.batch.salesTaxPercent != null ? Math.round((itemSum + shipSum) * S.batch.salesTaxPercent / 100) : null;
    var gross = itemSum + shipSum + (tax || 0);
    return '<div class="wb-endtotals">' +
      '<div class="wb-bill-row"><span>Sales tax</span><span class="wb-money">' + (tax != null ? usd(tax) : '—') + '</span></div>' +
      '<div class="wb-bill-row wb-bill-total"><span>Gross total</span><span class="wb-money">' + usd(gross) + '</span></div></div>';
  }
  function excludedBlock(lines) {
    var rows = lines.filter(excluded);
    if (!rows.length) return '';
    var edit = canEdit();
    var h = '<div class="wb-store wb-excluded"><p class="wb-store-name">Items Excluded</p><table class="wb-table"><colgroup>' +
      '<col class="wb-col-item"><col class="wb-col-when"><col class="wb-col-ship"><col class="wb-col-price">' + (edit ? '<col class="wb-col-del">' : '') +
      '</colgroup><thead><tr>' +
      '<th scope="col">Item</th><th scope="col">Expected delivery*</th><th scope="col" class="wb-money">Shipping cost</th><th scope="col" class="wb-money">Price</th>' +
      (edit ? '<th scope="col"><span class="wb-sr">Delete</span></th>' : '') +
      '</tr></thead><tbody>';
    rows.forEach(function (l) {
      h += '<tr class="wb-tr wb-row-excluded">' +
        '<td data-label="Item">' + itemCell(l) + '</td>' +
        '<td data-label="Expected delivery" class="wb-money">NA</td>' +
        '<td data-label="Shipping cost" class="wb-money">NA</td>' +
        '<td data-label="Price" class="wb-money">NA</td>';
      if (edit) h += '<td class="wb-del"><button type="button" class="wb-trash" data-act="remove" data-line="' + esc(l.id) + '" aria-label="Delete item" title="Delete item">' + TRASH_SVG + '</button></td>';
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  function billBlock(bill, withWrapDetail) {
    var h = '<h2>Your total</h2>';
    bill.groups.forEach(function (g) {
      h += '<p class="wb-bill-store">' + esc(g.retailerName) + '</p>';
      g.items.forEach(function (it) { h += row(it.title + (it.variant ? ' (' + it.variant + ')' : ''), usd(it.cents)); });
      h += row('Shipping: ' + g.shipping.label, g.shipping.cents ? usd(g.shipping.cents) : 'Free');
      h += row(g.retailerName + ' tax', usd(g.taxCents));
    });
    var w = bill.wrap;
    h += '<p class="wb-bill-store">Wrrapd</p>';
    h += row('Gift-wrap (' + (w.giftWrapCount || 0) + ')', usd(w.giftWrapCents));
    if (w.discountCents) h += row('Multi-item discount', '-' + usd(w.discountCents));
    if (w.designAiCents) h += row('AI design', usd(w.designAiCents));
    if (w.designUploadCents) h += row('Your design', usd(w.designUploadCents));
    if (w.flowersCents) h += row('Flowers', usd(w.flowersCents));
    if (w.boxCents) h += row('Gift box', usd(w.boxCents));
    h += row('Tax on gift-wrap', usd(w.serviceTaxCents));
    h += '<div class="wb-bill-row wb-bill-total"><span>Total</span><span>' + usd(bill.totalCents) + '</span></div>';
    if (bill.bundles && bill.bundles.length) {
      h += '<p class="wb-bill-store">Deliveries</p>';
      bill.bundles.forEach(function (bd) {
        h += '<p class="wb-muted">' + (bd.deliveryDate ? esc(fmtDate(bd.deliveryDate)) : 'Date to follow') + ': ' + esc(bd.titles.join(', ')) +
          (bd.titles.length > 1 ? ' (wrapped and delivered together)' : '') + '</p>';
      });
    }
    return h;
    function row(a, b) { return '<div class="wb-bill-row"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>'; }
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
    var lines = readyLines();
    var l = lines[S.wrapIndex];
    if (!l) { S.view = 'review'; return viewReview(); }
    var w = l.wrap || {};
    var style = w.style || 'wrrapd';
    var custom = S.pricing && S.pricing.customDesign && S.pricing.customDesign.available;
    var occ = (S.config.occasions || []).map(function (o) { return '<option' + (w.occasion === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    var ai = S.ai[l.id] || {};
    var h = '<section class="wb-card"><p class="wb-muted">Gift-wrap for item ' + (S.wrapIndex + 1) + ' of ' + lines.length + '</p>' +
      '<div class="wb-wrap-head">' + (l.product.imageUrl ? '<img src="' + esc(l.product.imageUrl) + '" alt="">' : '') + '<h2>' + esc(l.product.title) + '</h2></div>' +
      '<label class="wb-label" for="wb-occ">Occasion</label><select class="wb-input" id="wb-occ"><option value="">Choose…</option>' + occ + '</select>' +
      '<p class="wb-label">Wrapping</p>' +
      radio('wrrapd', 'Wrrapd paper' + (unit('giftWrapBase') ? ' · ' + unit('giftWrapBase') : '')) +
      (custom ? radio('ai', 'AI design made for this gift' + (unit('customDesignAi') ? ' · +' + unit('customDesignAi') : '')) : '') +
      (custom ? radio('upload', 'Upload your own design' + (unit('customDesignUpload') ? ' · +' + unit('customDesignUpload') : '')) : '');
    if (style === 'ai') {
      h += '<div class="wb-sub">';
      if (ai.loading) h += '<p class="wb-status"><span class="wb-spin"></span>Creating designs… this can take a minute.</p>';
      else if (ai.designs && ai.designs.length) {
        h += '<div class="wb-grid">' + ai.designs.map(function (d, i) {
          var sel = (ai.picked === i) || (w.aiDesign && ai.picked == null && w.aiDesign.title === d.title);
          return d.imageUrl ? '<button type="button" class="wb-tile' + (sel ? ' wb-tile-on' : '') + '" data-act="pick-ai" data-i="' + i + '"><img src="' + esc(d.imageUrl) + '" alt=""><span>' + esc(d.title) + '</span></button>' : '';
        }).join('') + '</div>';
      } else if (w.aiDesign) h += '<p class="wb-muted">Chosen design: ' + esc(w.aiDesign.title) + '</p>';
      h += '<button type="button" class="wb-link-btn" data-act="gen-ai"' + (ai.loading ? ' disabled' : '') + '>' + (ai.designs ? 'Create new designs' : 'Create designs') + '</button></div>';
    }
    if (style === 'upload') {
      h += '<div class="wb-sub"><input type="file" id="wb-file" accept="image/jpeg,image/png,image/webp">' +
        (w.upload ? '<p class="wb-muted">Uploaded: ' + esc(w.upload.fileName) + '</p>' : '<p class="wb-muted">JPG, PNG, or WEBP, up to 5 MB.</p>') + '</div>';
    }
    var fl = w.flowers;
    h += '<label class="wb-check"><input type="checkbox" id="wb-flowers"' + (fl || S.flowersOpen ? ' checked' : '') + '> Add flowers</label>';
    if (fl || S.flowersOpen) {
      h += '<div class="wb-sub">';
      if (!S.flowers) h += '<p class="wb-status"><span class="wb-spin"></span>Finding flowers near the giftee…</p>';
      else if (S.flowers.status !== 'ok' || !S.flowers.choices.length) h += '<p class="wb-muted">' + esc(S.flowers.message || 'Flowers are not available for this ZIP code.') + '</p>';
      else {
        h += '<div class="wb-grid">' + S.flowers.choices.map(function (c) {
          var on = fl && fl.offerId === c.offerId;
          return '<button type="button" class="wb-tile' + (on ? ' wb-tile-on' : '') + '" data-act="pick-flower" data-offer="' + esc(c.offerId) + '"><img src="' + esc(c.imageUrl) + '" alt=""><span>' + esc(c.title) + ' · ' + usdNum(c.price) + '</span></button>';
        }).join('') + '</div>';
      }
      h += '</div>';
    }
    h += '<label class="wb-label" for="wb-msg">Gift message (optional)</label><textarea class="wb-input" id="wb-msg" maxlength="300" rows="3">' + esc(w.giftMessage || '') + '</textarea>' +
      '<label class="wb-label" for="wb-from">From (optional)</label><input class="wb-input" id="wb-from" maxlength="80" value="' + esc(w.senderName || '') + '">' +
      (S.error ? '<p class="wb-error">' + esc(S.error) + '</p>' : '') +
      '<div class="wb-actions"><button type="button" class="wb-btn wb-btn-ghost" data-act="wrap-back">Back</button>' +
      '<button type="button" class="wb-btn" data-act="wrap-save"' + (S.busy ? ' disabled' : '') + '>' + (S.wrapIndex + 1 < lines.length ? 'Save and next item' : 'Save and review') + '</button></div></section>';
    return h;
    function radio(v, label) {
      return '<label class="wb-radio"><input type="radio" name="wb-style" value="' + v + '"' + (style === v ? ' checked' : '') + '> ' + esc(label) + '</label>';
    }
  }

  function viewReview() {
    var b = S.batch;
    var h = '<section class="wb-card">' + (b.bill ? billBlock(b.bill, true) : '<p class="wb-error">' + esc(b.billError || 'Your total is being prepared.') + '</p>') + '</section>';
    h += '<p class="wb-muted">When you click Pay, we check the latest prices with each store one more time.</p>';
    if (S.error) h += '<p class="wb-error">' + esc(S.error) + '</p>';
    h += '<div class="wb-actions"><button type="button" class="wb-btn wb-btn-ghost" data-act="review-back">Edit gift-wrap</button>' +
      '<button type="button" class="wb-btn" data-act="to-pay"' + (b.bill ? '' : ' disabled') + '>Review and pay</button></div>';
    return h;
  }

  function viewPaid() {
    return '<section class="wb-card wb-center"><h2>Thank you!</h2><p>Your order number is <b>' + esc(S.batch.orderNumber || S.batch.id) + '</b>.</p><p>We are buying your items, gift-wrapping them, and delivering them.</p></section>';
  }

  /* ---------- actions ---------- */
  root.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !root.contains(el) || el.disabled) return;
    onAct({ currentTarget: el, preventDefault: function () { e.preventDefault(); } });
  });

  function bind() {
    var zipEdit = $('#wb-zip-edit');
    if (zipEdit) zipEdit.addEventListener('change', onZip);
    $all('[data-ship]').forEach(function (el) { el.addEventListener('change', onShip); });
    $all('[data-variant]').forEach(function (el) {
      el.addEventListener('change', function () { S.variantDraft[el.getAttribute('data-variant') + '|' + el.getAttribute('data-group')] = el.value; });
    });
    $all('input[name="wb-style"]').forEach(function (el) {
      el.addEventListener('change', function () { saveDraft(); currentLine().wrap = Object.assign({}, currentLine().wrap || {}, { style: el.value, done: false }); render(); });
    });
    var flw = $('#wb-flowers');
    if (flw) flw.addEventListener('change', function () { saveDraft(); onFlowersToggle(flw.checked); });
    var file = $('#wb-file');
    if (file) file.addEventListener('change', function () { saveDraft(); onUpload(file.files && file.files[0]); });
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

  function currentLine() { return readyLines()[S.wrapIndex]; }

  function saveDraft() {
    var l = currentLine();
    if (!l) return;
    var w = Object.assign({}, l.wrap || {});
    var occ = $('#wb-occ');
    if (occ) w.occasion = occ.value;
    var msg = $('#wb-msg');
    if (msg) w.giftMessage = msg.value;
    var from = $('#wb-from');
    if (from) w.senderName = from.value;
    l.wrap = w;
  }

  function onAct(e) {
    var el = e.currentTarget;
    var act = el.getAttribute('data-act');
    S.error = '';
    if (act === 'add-link') { keepLinks(function () { S.linkCount = Math.min(S.config.maxLinks, S.linkCount + 1); }); return; }
    if (act === 'create') return create();
    if (act === 'remove') return removeLine(el.getAttribute('data-line'));
    if (act === 'add-item') return addItem();
    if (act === 'variant') return submitVariant(el.getAttribute('data-line'));
    if (act === 'to-terms') { S.termsOpen = true; S.termsScrolled = false; render(); return; }
    if (act === 'close-terms') { S.termsOpen = false; render(); return; }
    if (act === 'accept') return accept();
    if (act === 'wrap-back') { saveDraft(); if (S.wrapIndex > 0) S.wrapIndex--; else S.view = 'items'; S.flowersOpen = false; render(); return; }
    if (act === 'wrap-save') return saveWrap();
    if (act === 'review-back') { S.view = 'wrap'; S.wrapIndex = Math.max(0, readyLines().length - 1); render(); return; }
    if (act === 'to-pay') { location.href = PAY + '?b=' + encodeURIComponent(S.id) + '&t=' + encodeURIComponent(S.token); return; }
    if (act === 'gen-ai') return genAi();
    if (act === 'pick-ai') { saveDraft(); var ai = S.ai[currentLine().id]; ai.picked = Number(el.getAttribute('data-i')); render(); return; }
    if (act === 'pick-flower') return pickFlower(el.getAttribute('data-offer'));
  }

  function keepLinks(fn) {
    var vals = $all('.wb-link').map(function (i) { return i.value; });
    var zip = ($('#wb-zip') || {}).value || '';
    fn();
    render();
    $all('.wb-link').forEach(function (i, n) { if (vals[n]) i.value = vals[n]; });
    if ($('#wb-zip')) $('#wb-zip').value = zip;
  }

  function create() {
    var zip = ($('#wb-zip').value || '').replace(/\D/g, '');
    var links = $all('.wb-link').map(function (i) { return i.value.trim(); }).filter(Boolean);
    if (zip.length !== 5) { S.error = 'Please enter the giftee’s 5-digit ZIP code.'; return keepLinks(function () {}); }
    if (!links.length) { S.error = 'Please paste at least one product link.'; return keepLinks(function () {}); }
    S.busy = true;
    keepLinks(function () {});
    request('/api/buy/batches', { preview: preview, gifteeZip: zip, links: links }).then(function (j) {
      S.busy = false;
      S.id = j.id;
      S.token = j.token;
      S.batch = j.batch;
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
      .then(function (j) { S.pricing = j; if (S.view === 'wrap') render(); })
      .catch(function () {});
  }

  function needsPoll() {
    var b = S.batch;
    if (!b || b.status !== 'open') return false;
    return stillWorking() && b.lines.some(function (l) { return l.state === 'reading' || l.state === 'quoting'; });
  }

  function poll() {
    clearTimeout(S.pollTimer);
    if (!needsPoll()) return;
    S.pollTimer = setTimeout(function () {
      request('/api/buy/batches/' + encodeURIComponent(S.id)).then(function (j) {
        S.batch = j.batch;
        if (S.view === 'items') {
          var active = document.activeElement;
          var typing = active && root.contains(active) && (active.tagName === 'SELECT' || active.id === 'wb-zip-edit' || active.id === 'wb-add-link');
          if (!typing) render();
        }
        poll();
      }).catch(function () { poll(); });
    }, 4000);
  }

  function onZip() {
    var el = $('#wb-zip-edit');
    if (!el || !S.batch) return;
    var zip = (el.value || '').replace(/\D/g, '');
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

  function submitVariant(lineId) {
    var choices = {};
    var l = S.batch.lines.filter(function (x) { return x.id === lineId; })[0];
    (l.product.variantGroups || []).forEach(function (vg) { choices[vg.name] = S.variantDraft[lineId + '|' + vg.name] || ''; });
    change('/variant', { lineId: lineId, choices: choices }).catch(function () {});
  }

  function accept() {
    var elec = document.getElementById('wb-elec');
    change('/accept', {
      version: S.terms.version,
      scrolledToEnd: !!S.termsScrolled,
      agreed: !!(document.getElementById('wb-agree') || {}).checked,
      electronicsAccepted: elec ? elec.checked : false,
    }).then(function () {
      S.termsOpen = false;
      S.view = 'wrap';
      S.wrapIndex = 0;
      render();
      window.scrollTo(0, root.offsetTop - 20);
    }).catch(function () {});
  }

  function onFlowersToggle(on) {
    var l = currentLine();
    S.flowersOpen = on;
    if (!on) { l.wrap = Object.assign({}, l.wrap || {}, { flowers: null }); render(); return; }
    render();
    if (S.flowers) return;
    fetch(API + '/api/flowers/catalog?postalCode=' + encodeURIComponent(S.batch.gifteeZip))
      .then(function (r) { return r.json(); })
      .then(function (j) { S.flowers = j || { status: 'unavailable', choices: [] }; render(); })
      .catch(function () { S.flowers = { status: 'unavailable', choices: [] }; render(); });
  }

  function pickFlower(offerId) {
    saveDraft();
    var c = (S.flowers.choices || []).filter(function (x) { return x.offerId === offerId; })[0];
    if (!c) return;
    var l = currentLine();
    l.wrap = Object.assign({}, l.wrap || {}, { flowers: { offerId: c.offerId, amount: c.price, imageUrl: c.imageUrl, title: c.title } });
    render();
  }

  function genAi() {
    saveDraft();
    var l = currentLine();
    var occ = (l.wrap && l.wrap.occasion) || '';
    if (!occ) { S.error = 'Please choose an occasion first.'; render(); return; }
    S.ai[l.id] = { loading: true };
    render();
    fetch(API + '/generate-ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occasion: occ, productTitle: l.product.title, retailer: l.retailerName }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (typeof d === 'string') d = JSON.parse(d);
      S.ai[l.id] = { designs: (d && d.designs) || [], picked: null };
      if (!S.ai[l.id].designs.some(function (x) { return x.imageUrl; })) S.error = 'We could not create designs right now. Please try again or choose Wrrapd paper.';
      render();
    }).catch(function () {
      S.ai[l.id] = {};
      S.error = 'We could not create designs right now. Please try again or choose Wrrapd paper.';
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

  function saveWrap() {
    saveDraft();
    var l = currentLine();
    var w = l.wrap || {};
    var style = w.style || 'wrrapd';
    if (!w.occasion) { S.error = 'Please choose an occasion.'; render(); return; }
    if (style === 'upload' && !(w.upload && w.upload.filePath)) { S.error = 'Please upload your design.'; render(); return; }
    if (S.flowersOpen && !w.flowers) { S.error = 'Please choose flowers, or uncheck Add flowers.'; render(); return; }
    S.busy = true;
    render();
    var designP = style === 'ai' ? saveAiChoice(l) : Promise.resolve(null);
    designP.then(function (aiDesign) {
      var payload = { occasion: w.occasion, style: style, giftMessage: w.giftMessage || '', senderName: w.senderName || '' };
      if (aiDesign) payload.aiDesign = aiDesign;
      if (style === 'upload') payload.upload = w.upload;
      if (w.flowers) payload.flowers = w.flowers;
      return request('/api/buy/batches/' + encodeURIComponent(S.id) + '/wrap', { lineId: l.id, wrap: payload });
    }).then(function (j) {
      S.busy = false;
      S.batch = j.batch;
      S.flowersOpen = false;
      var lines = readyLines();
      if (S.wrapIndex + 1 < lines.length) S.wrapIndex++;
      else S.view = 'review';
      render();
      window.scrollTo(0, root.offsetTop - 20);
    }).catch(function (err) {
      S.busy = false;
      S.error = err.message;
      render();
    });
  }

  /* ---------- start ---------- */
  function start() {
    Promise.all([
      fetch(API + '/api/buy/config?preview=' + encodeURIComponent(preview)).then(function (r) { return r.json(); }),
      fetch(API + '/api/buy/terms').then(function (r) { return r.json(); }),
    ]).then(function (res) {
      S.config = res[0];
      S.terms = res[1];
      if (!S.id || !S.token) { render(); return; }
      return request('/api/buy/batches/' + encodeURIComponent(S.id)).then(function (j) {
        S.batch = j.batch;
        if (S.batch.status === 'paid' || S.batch.status === 'closed') S.view = 'paid';
        else if (S.batch.termsAccepted && !stillWorking() && readyLines().length) {
          var firstOpen = readyLines().findIndex(function (l) { return !(l.wrap && l.wrap.done); });
          S.view = firstOpen < 0 ? 'review' : 'wrap';
          S.wrapIndex = Math.max(0, firstOpen);
        } else S.view = 'items';
        loadPricing();
        render();
        poll();
      }).catch(function () {
        S.id = '';
        S.token = '';
        S.view = 'start';
        history.replaceState(null, '', location.pathname);
        render();
      });
    }).catch(function () {
      root.innerHTML = '<div class="wb-wrap"><p class="wb-error">This page could not load. Please refresh.</p></div>';
    });
  }
  start();
})();

(function () {
	'use strict';

	var STORAGE_KEY = 'wrrapd_gift_popup_dismissed';
	var OPEN_DELAY_MS = 1800;

	var root = document.getElementById('wrrapd-gift-popup');
	if (!root) {
		return;
	}

	var config = window.wrrapdGiftPopup || {};
	var retailers = Array.isArray(config.retailers) ? config.retailers : [];
	if (!retailers.length) {
		return;
	}

	var heroEl = root.querySelector('.wrrapd-gift-popup__hero');
	var fitEl = root.querySelector('.wrrapd-gift-popup__hero-fit');
	var panelEl = root.querySelector('.wrrapd-gift-popup__panel');
	var nameEl = document.getElementById('wrrapd-gift-popup-name');
	var logoEl = document.getElementById('wrrapd-gift-popup-logo');
	var closeBtn = document.getElementById('wrrapd-gift-popup-close');
	var anythingEl = document.getElementById('wrrapd-gift-popup-anything');

	var cyclingTimer = null;
	var openTimer = null;
	var handwriteTimer = null;
	var currentIndex = 0;
	var isOpen = false;
	var LETTER_MS = 90;

	function isDismissed() {
		try {
			return sessionStorage.getItem(STORAGE_KEY) === '1';
		} catch (e) {
			return false;
		}
	}

	function markDismissed() {
		try {
			sessionStorage.setItem(STORAGE_KEY, '1');
		} catch (e) {}
	}

	function extensionInstalled() {
		if (typeof window.wrrapdExtIsInstalled === 'function' && window.wrrapdExtIsInstalled()) {
			return true;
		}
		try {
			if (sessionStorage.getItem('wrrapd_ext_detected') === '1') {
				return true;
			}
		} catch (e) {}
		return document.documentElement.classList.contains('wrrapd-ext-installed');
	}

	/** Reserve a fixed column width so “Gift-wrap anything on” never shifts. */
	function lockRetailerColumnWidth() {
		if (!heroEl || !nameEl) {
			return;
		}

		var isMobile = window.matchMedia('(max-width: 720px)').matches;
		if (isMobile) {
			heroEl.style.removeProperty('--wgp-retailer-col');
			return;
		}

		var measure = document.createElement('span');
		measure.className = 'wrrapd-gift-popup__name';
		measure.style.position = 'absolute';
		measure.style.visibility = 'hidden';
		measure.style.pointerEvents = 'none';
		measure.style.whiteSpace = 'nowrap';
		measure.style.left = '-9999px';
		measure.style.top = '0';
		document.body.appendChild(measure);

		var maxWidth = 0;
		retailers.forEach(function (item) {
			measure.textContent = item.display || item.label || '';
			measure.style.color = item.color || '#0f172a';
			measure.style.fontFamily = item.font || "'Inter', system-ui, sans-serif";
			maxWidth = Math.max(maxWidth, measure.offsetWidth);
		});

		document.body.removeChild(measure);

		var logoWidth = logoEl ? logoEl.offsetWidth : 0;
		var gap = 12;
		var colPx = maxWidth + logoWidth + gap;
		heroEl.style.setProperty('--wgp-retailer-col', colPx + 'px');
	}

	/** Scale hero down so the full line fits inside the 80% banner. */
	function fitBanner() {
		if (!heroEl || !fitEl || !panelEl) {
			return;
		}

		lockRetailerColumnWidth();

		heroEl.style.transform = 'scale(1)';
		fitEl.style.minHeight = '';
		fitEl.style.height = 'auto';

		var available = fitEl.clientWidth;
		var contentW = heroEl.scrollWidth;
		var scale = 1;
		if (available > 0 && contentW > available) {
			scale = Math.min(1, (available - 4) / contentW);
			heroEl.style.transform = 'scale(' + scale + ')';
		}

		window.requestAnimationFrame(function () {
			var rect = heroEl.getBoundingClientRect();
			var pad = 10;
			fitEl.style.minHeight = Math.ceil(rect.height + pad) + 'px';
		});
	}

	function initHandwrite() {
		if (!anythingEl || anythingEl.dataset.wgpReady === '1') {
			return;
		}

		var word = (anythingEl.textContent || 'anything').trim();
		anythingEl.textContent = '';
		anythingEl.setAttribute('aria-label', word);

		word.split('').forEach(function (ch, i) {
			var span = document.createElement('span');
			span.className = 'wrrapd-gift-popup__letter';
			span.textContent = ch;
			span.style.animationDelay = (i * (LETTER_MS / 1000)) + 's';
			anythingEl.appendChild(span);
		});

		anythingEl.dataset.wgpReady = '1';
	}

	function replayHandwrite() {
		if (!anythingEl) {
			return;
		}

		initHandwrite();

		if (handwriteTimer) {
			window.clearTimeout(handwriteTimer);
			handwriteTimer = null;
		}

		anythingEl.classList.remove('is-written', 'is-writing');
		var letters = anythingEl.querySelectorAll('.wrrapd-gift-popup__letter');
		letters.forEach(function (letter, i) {
			letter.style.animation = 'none';
			letter.style.opacity = '0';
			letter.style.transform = 'translateY(0.14em) scale(0.88)';
			letter.style.animationDelay = (i * (LETTER_MS / 1000)) + 's';
		});

		void anythingEl.offsetWidth;
		anythingEl.classList.add('is-writing');

		letters.forEach(function (letter) {
			letter.style.animation = '';
		});

		var writeMs = letters.length * LETTER_MS + 420;
		handwriteTimer = window.setTimeout(function () {
			anythingEl.classList.add('is-written');
			fitBanner();
		}, writeMs);
	}

	function applyRetailer(item) {
		if (!nameEl || !logoEl || !item) {
			return;
		}

		nameEl.textContent = item.display || item.label || '';
		nameEl.style.color = item.color || '#0f172a';
		nameEl.style.fontFamily = item.font || "'Inter', system-ui, sans-serif";

		var img = logoEl.querySelector('img');
		if (!img) {
			img = document.createElement('img');
			img.width = 72;
			img.height = 72;
			img.decoding = 'async';
			img.alt = item.label || '';
			logoEl.innerHTML = '';
			logoEl.appendChild(img);
		}
		img.src = item.logo || '';
		img.alt = item.label || '';

		logoEl.classList.remove('is-pop');
		void logoEl.offsetWidth;
		logoEl.classList.add('is-pop');
	}

	function cycleRetailer() {
		if (!isOpen) {
			return;
		}

		var nextIndex = (currentIndex + 1) % retailers.length;
		var isEndOfLoop = nextIndex === 0;

		if (nameEl) {
			nameEl.classList.add('is-exiting');
		}

		window.setTimeout(function () {
			currentIndex = nextIndex;
			applyRetailer(retailers[currentIndex]);
			if (nameEl) {
				nameEl.classList.remove('is-exiting');
				nameEl.classList.add('is-entering');
				window.setTimeout(function () {
					nameEl.classList.remove('is-entering');
				}, 340);
			}
		}, 180);

		cyclingTimer = window.setTimeout(cycleRetailer, isEndOfLoop ? 1300 : 520);

		if (isEndOfLoop) {
			replayHandwrite();
		}
	}

	function startCycling() {
		if (cyclingTimer) {
			window.clearTimeout(cyclingTimer);
		}
		currentIndex = 0;
		applyRetailer(retailers[0]);
		cyclingTimer = window.setTimeout(cycleRetailer, 480);
	}

	function stopCycling() {
		if (cyclingTimer) {
			window.clearTimeout(cyclingTimer);
			cyclingTimer = null;
		}
		if (handwriteTimer) {
			window.clearTimeout(handwriteTimer);
			handwriteTimer = null;
		}
	}

	function openPopup() {
		if (isOpen || extensionInstalled() || isDismissed()) {
			return;
		}

		isOpen = true;
		root.classList.add('is-open');
		root.setAttribute('aria-hidden', 'false');
		initHandwrite();
		startCycling();

		var runLayout = function () {
			replayHandwrite();
			window.requestAnimationFrame(function () {
				fitBanner();
				window.requestAnimationFrame(fitBanner);
			});
		};

		if (document.fonts && document.fonts.ready) {
			document.fonts.ready.then(runLayout);
		} else {
			runLayout();
		}
	}

	function closePopup(persist) {
		if (!isOpen) {
			return;
		}

		isOpen = false;
		root.classList.remove('is-open');
		root.setAttribute('aria-hidden', 'true');
		stopCycling();

		if (persist) {
			markDismissed();
		}
	}

	function scheduleOpen() {
		if (extensionInstalled() || isDismissed()) {
			return;
		}

		openTimer = window.setTimeout(function () {
			if (!extensionInstalled()) {
				openPopup();
			}
		}, OPEN_DELAY_MS);
	}

	if (closeBtn) {
		closeBtn.addEventListener('click', function () {
			closePopup(true);
		});
	}

	root.addEventListener('click', function (event) {
		if (event.target === root) {
			closePopup(true);
		}
	});

	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape' && isOpen) {
			closePopup(true);
		}
	});

	window.addEventListener('resize', function () {
		if (isOpen) {
			fitBanner();
		}
	});

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', scheduleOpen);
	} else {
		scheduleOpen();
	}

	window.addEventListener('pageshow', function () {
		if (!isOpen && !isDismissed() && !extensionInstalled()) {
			scheduleOpen();
		}
	});
})();

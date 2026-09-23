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

	var nameEl = document.getElementById('wrrapd-gift-popup-name');
	var logoEl = document.getElementById('wrrapd-gift-popup-logo');
	var closeBtn = document.getElementById('wrrapd-gift-popup-close');
	var ctaEl = root.querySelector('.wrrapd-gift-popup__cta');

	var cyclingTimer = null;
	var openTimer = null;
	var currentIndex = 0;
	var isOpen = false;

	if (ctaEl && config.storeUrl) {
		ctaEl.setAttribute('href', config.storeUrl);
	}

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

	function applyRetailer(item) {
		if (!nameEl || !logoEl || !item) {
			return;
		}

		nameEl.textContent = item.display || item.label || '';
		nameEl.style.color = item.color || '#f6b933';
		nameEl.style.fontFamily = 'Fraunces, Georgia, "Times New Roman", serif';

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
				}, 320);
			}
		}, 160);

		cyclingTimer = window.setTimeout(cycleRetailer, 1400);
	}

	function startCycling() {
		if (cyclingTimer) {
			window.clearTimeout(cyclingTimer);
		}
		currentIndex = 0;
		applyRetailer(retailers[0]);
		cyclingTimer = window.setTimeout(cycleRetailer, 1400);
	}

	function stopCycling() {
		if (cyclingTimer) {
			window.clearTimeout(cyclingTimer);
			cyclingTimer = null;
		}
	}

	function openPopup() {
		if (isOpen || extensionInstalled() || isDismissed()) {
			return;
		}

		isOpen = true;
		root.classList.add('is-open');
		root.setAttribute('aria-hidden', 'false');
		startCycling();
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

		if (openTimer) {
			window.clearTimeout(openTimer);
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

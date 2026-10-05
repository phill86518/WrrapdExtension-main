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
	var videoUrl = config.videoUrl || 'https://wrrapd.com/wp-content/uploads/2026/10/Gift-Wrapped-in-a-Flash_-A-Quick-Flashy-Finish.mp4';
	var videoWrap = document.getElementById('wrrapd-gift-popup-video');
	var videoEl = document.getElementById('wrrapd-gift-popup-player');
	var panelEl = root.querySelector('.wrrapd-gift-popup__panel');

	if (videoUrl && panelEl && !videoEl) {
		videoWrap = document.createElement('div');
		videoWrap.className = 'wrrapd-gift-popup__video';
		videoWrap.id = 'wrrapd-gift-popup-video';
		videoWrap.hidden = true;
		videoEl = document.createElement('video');
		videoEl.id = 'wrrapd-gift-popup-player';
		videoEl.muted = false;
		videoEl.defaultMuted = false;
		videoEl.volume = 1;
		videoEl.playsInline = true;
		videoEl.setAttribute('playsinline', '');
		videoEl.preload = 'auto';
		videoEl.setAttribute('disablepictureinpicture', '');
		var src = document.createElement('source');
		src.src = videoUrl;
		src.type = 'video/mp4';
		videoEl.appendChild(src);
		videoWrap.appendChild(videoEl);
		panelEl.appendChild(videoWrap);
		root.classList.add('has-intro');
	}

	var cyclingTimer = null;
	var openTimer = null;
	var introTimer = null;
	var currentIndex = 0;
	var isOpen = false;
	var introDone = false;

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

	function readableNameColor(hex) {
		var raw = String(hex || '').replace('#', '').trim();
		if (raw.length === 3) {
			raw = raw.charAt(0) + raw.charAt(0) + raw.charAt(1) + raw.charAt(1) + raw.charAt(2) + raw.charAt(2);
		}
		if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
			return '#f6b933';
		}
		var r = parseInt(raw.slice(0, 2), 16);
		var g = parseInt(raw.slice(2, 4), 16);
		var b = parseInt(raw.slice(4, 6), 16);
		var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		return luma < 140 ? '#f6b933' : '#' + raw;
	}

	function applyRetailer(item) {
		if (!nameEl || !logoEl || !item) {
			return;
		}

		nameEl.textContent = item.display || item.label || '';
		nameEl.style.color = readableNameColor(item.color || '#f6b933');
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

	function prefersReducedMotion() {
		return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function finishIntro() {
		if (introTimer) {
			window.clearTimeout(introTimer);
			introTimer = null;
		}
		if (introDone) {
			return;
		}
		introDone = true;
		root.classList.remove('is-intro');
		if (videoWrap) {
			videoWrap.hidden = true;
		}
		if (videoEl) {
			try {
				videoEl.pause();
			} catch (e) {}
		}
		startCycling();
	}

	function playIntro(thenStart) {
		if (!videoEl || !videoUrl || prefersReducedMotion()) {
			if (thenStart) {
				thenStart();
			} else {
				startCycling();
			}
			return false;
		}

		introDone = false;
		root.classList.add('is-intro');
		if (videoWrap) {
			videoWrap.hidden = false;
		}

		function onEnded() {
			finishIntro();
		}
		videoEl.addEventListener('ended', onEnded, { once: true });
		videoEl.muted = false;
		videoEl.defaultMuted = false;
		videoEl.volume = 1;
		try {
			videoEl.currentTime = 0;
		} catch (e) {}

		var playAttempt = videoEl.play();
		if (playAttempt && typeof playAttempt.then === 'function') {
			playAttempt.catch(function () {
				finishIntro();
			});
		}

		introTimer = window.setTimeout(finishIntro, 12000);
		return true;
	}

	function openPopup() {
		if (isOpen || extensionInstalled() || isDismissed()) {
			return;
		}

		isOpen = true;
		root.classList.add('is-open');
		root.setAttribute('aria-hidden', 'false');
		if (!playIntro(startCycling)) {
			startCycling();
		}
	}

	function closePopup(persist) {
		if (!isOpen) {
			return;
		}

		isOpen = false;
		introDone = true;
		if (introTimer) {
			window.clearTimeout(introTimer);
			introTimer = null;
		}
		root.classList.remove('is-open', 'is-intro');
		root.setAttribute('aria-hidden', 'true');
		if (videoEl) {
			try {
				videoEl.pause();
			} catch (e) {}
		}
		if (videoWrap) {
			videoWrap.hidden = true;
		}
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

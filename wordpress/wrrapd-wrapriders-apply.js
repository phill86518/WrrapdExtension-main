/* wrrapd-wrapriders-apply.js — multi-step WrapRider (wrap + deliver) apply wizard (parity with WrapStars / JoyRider apply UX) */
(function () {
	var TIDBITS = [
		'WrapRiders own both halves of an order: gifts and supplies are dropped at your space, you wrap them, then you deliver them yourself.',
		'Being able to print custom wrapping paper lets you match a design to the occasion — a favorite of repeat customers.',
		'After activation, your email and password open the WrapRider app — wrap jobs and deliveries in one place.',
		'Double-check your answers below, then submit when you are ready.'
	];

	var form = document.getElementById('wrrapd-wraprider-apply-form');
	if (!form) return;

	var screens = Array.prototype.slice.call(form.querySelectorAll('.wrrapd-apply-screen'));
	var tidbitEl = document.getElementById('wrrapd-wr-apply-tidbit');
	var visualEl = document.getElementById('wrrapd-wr-apply-visual');
	var progressWrap = form.querySelector('.wrrapd-apply-wizard__progress');
	var progressFill = document.getElementById('wrrapd-wr-progress-fill');
	var progressLabel = document.getElementById('wrrapd-wr-progress-label');
	var navWrap = form.querySelector('.wrrapd-apply-wizard__nav');
	var backBtn = form.querySelector('.wrrapd-apply-back');
	var nextBtn = form.querySelector('.wrrapd-apply-next');
	var basicsNextBtn = document.getElementById('wrrapd-wr-basics-next');
	var reviewEl = document.getElementById('wrrapd-wr-apply-review');
	var startedAt = document.getElementById('wr_form_started_at');
	var printerSelect = document.getElementById('wr-printer');
	var printerSizeField = document.getElementById('wr-printer-size-field');
	var printerSizeSelect = document.getElementById('wr-printer-size');
	var current = 0;
	var wizardStarted = false;

	function isBasicsScreen(index) {
		return index === 0;
	}

	function isReviewScreen(index) {
		return index === screens.length - 1;
	}

	function syncPrinterSize() {
		if (!printerSelect || !printerSizeField || !printerSizeSelect) return;
		var show = printerSelect.value === 'yes';
		printerSizeField.hidden = !show;
		printerSizeSelect.required = show;
		if (!show) printerSizeSelect.value = '';
	}

	function showScreen(index) {
		current = index;
		screens.forEach(function (screen, i) {
			screen.classList.toggle('is-active', i === index);
			screen.hidden = i !== index;
		});

		var inWizard = wizardStarted && !isBasicsScreen(index);
		if (progressWrap) progressWrap.hidden = !inWizard;
		if (tidbitEl) tidbitEl.hidden = !inWizard;
		if (visualEl) visualEl.hidden = !isBasicsScreen(index);
		if (navWrap) navWrap.hidden = isBasicsScreen(index) || isReviewScreen(index);

		if (inWizard) {
			var label = screens[index].getAttribute('data-step-label') || '';
			if (progressLabel) progressLabel.textContent = label;
			if (progressFill) {
				var pct = Math.round((index / (screens.length - 1)) * 100);
				progressFill.style.width = pct + '%';
			}
			if (tidbitEl) {
				var tidbitIndex = index - 1;
				if (tidbitIndex >= 0 && tidbitIndex < TIDBITS.length) {
					tidbitEl.innerHTML = '<p class="wrrapd-apply-tidbit__label">Did you know?</p><p>' + TIDBITS[tidbitIndex] + '</p>';
				} else {
					tidbitEl.innerHTML = '';
				}
			}
		} else {
			if (progressFill) progressFill.style.width = '0%';
			if (progressLabel) progressLabel.textContent = '';
			if (tidbitEl) tidbitEl.innerHTML = '';
		}

		if (isReviewScreen(index)) {
			buildReview();
		}

		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function fieldValue(name) {
		var el = form.elements.namedItem(name);
		if (!el) return '';
		if (el.type === 'checkbox') return el.checked ? 'Yes' : 'No';
		if (el.type === 'file') {
			return el.files && el.files[0] ? el.files[0].name : '';
		}
		return (el.value || '').trim();
	}

	function selectLabel(name) {
		var el = form.elements.namedItem(name);
		if (!el || !el.options) return fieldValue(name);
		var opt = el.options[el.selectedIndex];
		return opt ? (opt.textContent || '').trim() : fieldValue(name);
	}

	function screenIndexForName(name) {
		var el = form.querySelector('[name="' + name + '"]');
		if (!el) return 0;
		var screen = el.closest('.wrrapd-apply-screen');
		if (!screen) return 0;
		var idx = screens.indexOf(screen);
		return idx < 0 ? 0 : idx;
	}

	function buildReview() {
		if (!reviewEl) return;
		var rows = [
			['Name', [fieldValue('first_name'), fieldValue('middle_name'), fieldValue('last_name')].filter(Boolean).join(' '), 'first_name'],
			['Nickname', fieldValue('nickname'), 'nickname'],
			['Email', fieldValue('email'), 'email'],
			['Mobile', fieldValue('phone_mobile'), 'phone_mobile'],
			['Address', [fieldValue('address_line1'), fieldValue('address_line2'), fieldValue('city'), selectLabel('state'), fieldValue('postal_code')].filter(Boolean).join(', '), 'address_line1'],
			['21 or older', selectLabel('age_21'), 'age_21'],
			['Valid license', selectLabel('has_valid_license'), 'has_valid_license'],
			['Vehicle', selectLabel('has_vehicle') + (fieldValue('vehicle_type') ? ' · ' + selectLabel('vehicle_type') : ''), 'has_vehicle'],
			['Smartphone', selectLabel('has_smartphone'), 'has_smartphone'],
			['Driving record', selectLabel('clean_driving_record'), 'clean_driving_record'],
			['Delivery range', selectLabel('delivery_max_distance'), 'delivery_max_distance'],
			['Dedicated wrap space', selectLabel('dedicated_wrap_workspace'), 'dedicated_wrap_workspace'],
			['Video monitoring', selectLabel('comfortable_video_monitoring'), 'comfortable_video_monitoring'],
			['Custom-print wrap', selectLabel('has_large_format_printer') + (fieldValue('printer_size') ? ' · ' + selectLabel('printer_size') : ''), 'has_large_format_printer'],
			['Wrapping experience', fieldValue('gift_wrapping_experience'), 'gift_wrapping_experience'],
			['Availability', fieldValue('availability'), 'availability'],
			['Delivery experience', fieldValue('delivery_experience'), 'delivery_experience'],
			['Why WrapRider', fieldValue('why_wraprider'), 'why_wraprider'],
			['Bank ready', selectLabel('bank_account_ready'), 'bank_account_ready'],
			['ID upload', fieldValue('gov_id'), 'gov_id'],
			['Driving record / abstract', fieldValue('driving_abstract'), 'driving_abstract']
		];
		var html = '<dl>';
		rows.forEach(function (row) {
			if (!row[1]) return;
			html += '<dt>' + row[0] + '</dt><dd>' + String(row[1]).replace(/</g, '&lt;') +
				' <button type="button" class="wrrapd-apply-edit" data-goto="' + screenIndexForName(row[2]) + '">Edit</button></dd>';
		});
		html += '</dl>';
		reviewEl.innerHTML = html;
		reviewEl.querySelectorAll('.wrrapd-apply-edit').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var goto = parseInt(btn.getAttribute('data-goto'), 10);
				if (!isNaN(goto)) {
					wizardStarted = true;
					showScreen(goto);
				}
			});
		});
	}

	function isHoneypot(el) {
		return !!(el && el.closest && el.closest('.wrrapd-apply-honeypot'));
	}

	function requiredFieldsIn(screen) {
		return Array.prototype.slice.call(screen.querySelectorAll('input, select, textarea')).filter(function (el) {
			if (isHoneypot(el)) return false;
			if (el.disabled || el.type === 'hidden' || el.type === 'button' || el.type === 'submit') return false;
			if (el.closest && el.closest('[hidden]') && el.closest('[hidden]') !== screen) return false;
			return el.required;
		});
	}

	function validateScreen(index, report) {
		var screen = screens[index];
		if (!screen) return true;
		var ok = true;
		requiredFieldsIn(screen).forEach(function (el) {
			var valid = true;
			if (el.type === 'checkbox') {
				valid = el.checked;
			} else if (el.type === 'file') {
				valid = el.files && el.files.length > 0;
			} else {
				valid = !!(el.value || '').trim();
				if (valid && typeof el.checkValidity === 'function') {
					valid = el.checkValidity();
				}
			}
			if (!valid) {
				ok = false;
				if (report && typeof el.reportValidity === 'function') {
					el.reportValidity();
				}
			}
		});
		return ok;
	}

	function basicsReady() {
		return validateScreen(0, false);
	}

	function updateBasicsNext() {
		if (!basicsNextBtn) return;
		basicsNextBtn.disabled = !basicsReady();
	}

	function formatPhone(input) {
		var digits = (input.value || '').replace(/\D/g, '').slice(0, 10);
		if (digits.length < 4) {
			input.value = digits;
			return;
		}
		if (digits.length < 7) {
			input.value = '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
			return;
		}
		input.value = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
	}

	var phone = document.getElementById('wr-phone');
	if (phone) {
		phone.addEventListener('input', function () { formatPhone(phone); updateBasicsNext(); });
	}

	if (printerSelect) {
		printerSelect.addEventListener('change', syncPrinterSize);
	}

	form.addEventListener('input', function (e) {
		if (isBasicsScreen(current) || (e.target && screens[0] && screens[0].contains(e.target))) {
			updateBasicsNext();
		}
	});
	form.addEventListener('change', function (e) {
		if (isBasicsScreen(current) || (e.target && screens[0] && screens[0].contains(e.target))) {
			updateBasicsNext();
		}
	});

	if (basicsNextBtn) {
		basicsNextBtn.addEventListener('click', function () {
			if (!validateScreen(0, true)) return;
			if (startedAt && !startedAt.value) {
				startedAt.value = String(Math.floor(Date.now() / 1000));
			}
			wizardStarted = true;
			showScreen(1);
		});
	}

	if (nextBtn) {
		nextBtn.addEventListener('click', function () {
			if (!validateScreen(current, true)) return;
			if (current < screens.length - 1) {
				showScreen(current + 1);
			}
		});
	}

	if (backBtn) {
		backBtn.addEventListener('click', function () {
			if (current > 0) {
				showScreen(current - 1);
			}
		});
	}

	form.addEventListener('submit', function (e) {
		// Ensure every screen validates before submit from review.
		for (var i = 0; i < screens.length; i++) {
			if (!validateScreen(i, false)) {
				e.preventDefault();
				wizardStarted = true;
				showScreen(i);
				validateScreen(i, true);
				return;
			}
		}
		if (startedAt && !startedAt.value) {
			startedAt.value = String(Math.floor(Date.now() / 1000));
		}
	});

	screens.forEach(function (screen, i) {
		if (i !== 0) screen.hidden = true;
	});
	syncPrinterSize();
	updateBasicsNext();
	showScreen(0);
})();

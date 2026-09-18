/* wrrapd-drivers-apply.js — multi-step JoyRider apply wizard (parity with WrapStars apply UX) */
(function () {
	var TIDBITS = [
		'Wrrapd JoyRiders deliver finished wrap orders — WrapStars handle the wrapping, you bring the smile to the door.',
		'You see pickup and drop-off in the app. WrapStars wrap — you bring the gift to the door.',
		'Double-check your answers below, then submit when you are ready.'
	];

	var form = document.getElementById('wrrapd-driver-apply-form');
	if (!form) return;

	var screens = Array.prototype.slice.call(form.querySelectorAll('.wrrapd-apply-screen'));
	var tidbitEl = document.getElementById('wrrapd-drv-apply-tidbit');
	var progressWrap = form.querySelector('.wrrapd-apply-wizard__progress');
	var progressFill = document.getElementById('wrrapd-drv-progress-fill');
	var progressLabel = document.getElementById('wrrapd-drv-progress-label');
	var navWrap = form.querySelector('.wrrapd-apply-wizard__nav');
	var backBtn = form.querySelector('.wrrapd-apply-back');
	var nextBtn = form.querySelector('.wrrapd-apply-next');
	var basicsNextBtn = document.getElementById('wrrapd-drv-basics-next');
	var reviewEl = document.getElementById('wrrapd-drv-apply-review');
	var startedAt = document.getElementById('drv_form_started_at');
	var current = 0;
	var wizardStarted = false;

	function isBasicsScreen(index) {
		return index === 0;
	}

	function isReviewScreen(index) {
		return index === screens.length - 1;
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

	function buildReview() {
		if (!reviewEl) return;
		var rows = [
			['Name', [fieldValue('first_name'), fieldValue('middle_name'), fieldValue('last_name')].filter(Boolean).join(' ')],
			['Nickname', fieldValue('nickname')],
			['Email', fieldValue('email')],
			['Mobile', fieldValue('phone_mobile')],
			['Address', [fieldValue('address_line1'), fieldValue('address_line2'), fieldValue('city'), selectLabel('state'), fieldValue('postal_code')].filter(Boolean).join(', ')],
			['21 or older', selectLabel('age_21')],
			['Valid license', selectLabel('has_valid_license')],
			['Vehicle', selectLabel('has_vehicle') + (fieldValue('vehicle_type') ? ' · ' + selectLabel('vehicle_type') : '')],
			['Smartphone', selectLabel('has_smartphone')],
			['Driving record', selectLabel('clean_driving_record')],
			['Bank ready', selectLabel('bank_account_ready')],
			['Availability', fieldValue('availability')],
			['Experience', fieldValue('delivery_experience')],
			['Why Wrrapd', fieldValue('why_drive')],
			['ID upload', fieldValue('gov_id')]
		];
		var html = '<dl>';
		rows.forEach(function (row, idx) {
			if (!row[1]) return;
			var screen = idx <= 4 ? 0 : (idx <= 10 ? 1 : 2);
			html += '<dt>' + row[0] + '</dt><dd>' + String(row[1]).replace(/</g, '&lt;') +
				' <button type="button" class="wrrapd-apply-edit" data-goto="' + screen + '">Edit</button></dd>';
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

	var phone = document.getElementById('drv-phone');
	if (phone) {
		phone.addEventListener('input', function () { formatPhone(phone); updateBasicsNext(); });
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
	updateBasicsNext();
	showScreen(0);
})();

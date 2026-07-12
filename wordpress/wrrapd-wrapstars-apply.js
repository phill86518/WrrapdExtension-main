(function () {
	/* wrrapd-wrapstars-apply.js v22 — address suggestions via WordPress proxy (no Maps JS). */
	var TIDBITS = [
		'A 24-inch large-format printer can produce custom wrap in a single continuous sheet — no seams — for gifts most retail paper rolls cannot cleanly cover.',
		'Professional wrappers often use the "hospital corner" fold — borrowed from bed-making — to get crisp, seamless edges on box corners without extra tape.',
		'This step covers authorization and logistics — no trivia here, just the important details.',
		'The record for fastest gift wrap is under 30 seconds for a shoebox-sized present — most professionals average 2–3 minutes for something that clean.',
		'Double-check your answers below, then submit when you are ready.'
	];

	var form = document.getElementById('wrrapd-wrapstar-apply-form');
	if (!form) return;

	var screens = Array.prototype.slice.call(form.querySelectorAll('.wrrapd-apply-screen'));
	var tidbitEl = document.getElementById('wrrapd-apply-tidbit');
	var progressWrap = form.querySelector('.wrrapd-apply-wizard__progress');
	var progressFill = document.getElementById('wrrapd-apply-progress-fill');
	var progressLabel = document.getElementById('wrrapd-apply-progress-label');
	var navWrap = form.querySelector('.wrrapd-apply-wizard__nav');
	var backBtn = form.querySelector('.wrrapd-apply-back');
	var nextBtn = form.querySelector('.wrrapd-apply-next');
	var basicsNextBtn = document.getElementById('wrrapd-apply-basics-next');
	var suggestPanel = document.getElementById('wrrapd-address-suggest-panel');
	var suggestText = document.getElementById('wrrapd-address-suggest-text');
	var suggestUseBtn = document.getElementById('wrrapd-address-suggest-use');
	var suggestKeepBtn = document.getElementById('wrrapd-address-suggest-keep');
	var reviewEl = document.getElementById('wrrapd-apply-review');
	var startedAt = document.getElementById('ws_form_started_at');
	var current = 0;
	var wizardStarted = false;
	var config = window.wrrapdWrapstarApply || {};
	var ajaxUrl = config.ajaxUrl || '';
	var placesNonce = config.placesNonce || '';

	var basicsFieldsValid = false;
	var suggestDismissedFor = '';
	var pendingSuggestedAddress = null;
	var basicsNextBusy = false;

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

		if (backBtn) backBtn.hidden = !inWizard || index <= 1;
		if (nextBtn) nextBtn.hidden = !inWizard || isReviewScreen(index);
		if (isReviewScreen(index)) buildReview();
	}

	function fieldsInScreen(screen) {
		return Array.prototype.slice.call(screen.querySelectorAll('input, select, textarea')).filter(function (el) {
			if (el.type === 'hidden' || el.name === 'ws_company_website') return false;
			if (el.closest('.wrrapd-apply-honeypot')) return false;
			if (el.closest('[hidden]')) return false;
			return true;
		});
	}

	function validateScreen(index, report) {
		var screen = screens[index];
		if (!screen) return true;
		var ok = true;
		fieldsInScreen(screen).forEach(function (el) {
			if (!el.checkValidity()) {
				ok = false;
				if (report) el.reportValidity();
			}
		});
		return ok;
	}

	function phoneDigits(value) {
		return String(value || '').replace(/\D/g, '');
	}

	function formatPhoneValue(value) {
		var d = phoneDigits(value).substring(0, 10);
		if (!d) return '';
		if (d.length <= 3) return '(' + d;
		if (d.length <= 6) return '(' + d.substring(0, 3) + ') ' + d.substring(3);
		return '(' + d.substring(0, 3) + ') ' + d.substring(3, 6) + '-' + d.substring(6);
	}

	function bindPhoneMask(id) {
		var el = document.getElementById(id);
		if (!el) return;
		function applyFormat() {
			el.value = formatPhoneValue(el.value);
		}
		el.addEventListener('input', function () {
			applyFormat();
			syncBasicsFields();
		});
		el.addEventListener('blur', applyFormat);
	}

	function isEmailValid(value) {
		var v = String(value || '').trim();
		if (!v) return false;
		var el = document.createElement('input');
		el.type = 'email';
		el.value = v;
		return el.checkValidity() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
	}

	function validateBasicsFieldsOnly() {
		var first = document.getElementById('ws-first-name');
		var last = document.getElementById('ws-last-name');
		var email = document.getElementById('ws-email');
		var mobile = document.getElementById('ws-phone-mobile');
		var line1 = document.getElementById('ws-address-line1');
		var city = document.getElementById('ws-city');
		var zip = document.getElementById('ws-postal-code');
		var state = document.getElementById('wrrapd-ws-state');

		if (!first || !last || !email || !mobile || !line1 || !city || !zip || !state) return false;
		if (!first.value.trim() || !last.value.trim()) return false;
		if (!isEmailValid(email.value)) return false;
		if (phoneDigits(mobile.value).length !== 10) return false;
		if (!line1.value.trim() || !city.value.trim()) return false;
		if (!state.value) return false;
		if (phoneDigits(zip.value).substring(0, 5).length !== 5) return false;
		return true;
	}

	function stateForValidation() {
		var stateSel = document.getElementById('wrrapd-ws-state');
		if (!stateSel || !stateSel.value || stateSel.value === 'OTHER') return '';
		return stateSel.value;
	}

	function getBasicsAddress() {
		return {
			line1: (document.getElementById('ws-address-line1') || {}).value || '',
			line2: (document.getElementById('ws-address-line2') || {}).value || '',
			city: (document.getElementById('ws-city') || {}).value || '',
			state: stateForValidation(),
			postal_code: (document.getElementById('ws-postal-code') || {}).value || '',
			country: 'US'
		};
	}

	function normalizeAddrPart(value) {
		return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
	}

	function addressFingerprint(addr) {
		return [
			normalizeAddrPart(addr.line1),
			normalizeAddrPart(addr.line2),
			normalizeAddrPart(addr.city),
			normalizeAddrPart(addr.state),
			phoneDigits(addr.postal_code).substring(0, 5)
		].join('|');
	}

	function hideAddressSuggestion() {
		pendingSuggestedAddress = null;
		if (suggestPanel) suggestPanel.hidden = true;
		if (suggestText) suggestText.textContent = '';
	}

	function showAddressSuggestion(suggested) {
		pendingSuggestedAddress = suggested;
		if (suggestText) {
			suggestText.textContent = suggested.formatted || [
				suggested.line1,
				suggested.city,
				suggested.state,
				phoneDigits(suggested.postal_code).substring(0, 5)
			].filter(Boolean).join(', ');
		}
		if (suggestPanel) suggestPanel.hidden = false;
	}

	function applySuggestedAddress(suggested) {
		var line1 = document.getElementById('ws-address-line1');
		var line2 = document.getElementById('ws-address-line2');
		var cityEl = document.getElementById('ws-city');
		var zipEl = document.getElementById('ws-postal-code');
		if (line1 && suggested.line1) line1.value = suggested.line1;
		if (line2) line2.value = suggested.line2 || '';
		if (cityEl && suggested.city) cityEl.value = suggested.city;
		if (zipEl && suggested.postal_code) zipEl.value = phoneDigits(suggested.postal_code).substring(0, 5);
		if (suggested.state) mapStateToSelect(suggested.state);
		hideAddressSuggestion();
		syncBasicsFields();
	}

	function addressesMeaningfullyDiffer(current, suggested) {
		if (!suggested || !suggested.line1) return false;
		var curZip = phoneDigits(current.postal_code).substring(0, 5);
		var sugZip = phoneDigits(suggested.postal_code).substring(0, 5);
		return normalizeAddrPart(current.line1) !== normalizeAddrPart(suggested.line1) ||
			normalizeAddrPart(current.city) !== normalizeAddrPart(suggested.city) ||
			(current.state && suggested.state && normalizeAddrPart(current.state) !== normalizeAddrPart(suggested.state)) ||
			(curZip && sugZip && curZip !== sugZip);
	}

	function extractSuggestedAddress(data) {
		if (!data || !data.result || !data.result.address) return null;
		var addr = data.result.address;
		var postal = addr.postalAddress || {};
		var line1 = '';
		var line2 = '';
		if (postal.addressLines && postal.addressLines.length) {
			line1 = postal.addressLines[0];
			if (postal.addressLines.length > 1) {
				line2 = postal.addressLines[1];
			}
		}
		var city = postal.locality || '';
		var state = postal.administrativeArea || '';
		var zip = postal.postalCode || '';
		var streetNumber = '';
		var route = '';
		var subpremise = '';

		(addr.addressComponents || []).forEach(function (component) {
			var text = '';
			if (component.componentName && component.componentName.text) {
				text = component.componentName.text;
			} else if (component.longText) {
				text = component.longText;
			} else if (component.shortText) {
				text = component.shortText;
			}
			var types = component.componentType || component.types || [];
			types.forEach(function (type) {
				if (type === 'street_number') streetNumber = text;
				if (type === 'route') route = text;
				if (type === 'subpremise' && !line2) line2 = text;
				if (type === 'locality' && !city) city = text;
				if (type === 'administrative_area_level_1' && !state) state = text;
				if (type === 'postal_code' && !zip) zip = text;
			});
		});

		if (!line1 && (streetNumber || route)) {
			line1 = [streetNumber, route].filter(Boolean).join(' ').trim();
		}

		if (!line2 && subpremise) line2 = subpremise;

		return {
			line1: line1,
			line2: line2,
			city: city,
			state: state,
			postal_code: zip,
			formatted: addr.formattedAddress || ''
		};
	}

	async function fetchAddressSuggestion(addr) {
		if (!ajaxUrl || !placesNonce) return null;
		var zip = phoneDigits(addr.postal_code).substring(0, 5);
		try {
			var response = await fetch(
				ajaxUrl + '?action=wrrapd_ws_validate_address&nonce=' + encodeURIComponent(placesNonce),
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						line1: addr.line1.trim(),
						line2: (addr.line2 || '').trim(),
						city: addr.city.trim(),
						state: addr.state || '',
						postal_code: zip
					})
				}
			);
			var data = await response.json();
			if (!data || !data.success || !data.data || !data.data.result) return null;
			return extractSuggestedAddress(data.data.result);
		} catch (e) {
			return null;
		}
	}

	function syncBasicsNext() {
		if (!basicsNextBtn) return;
		basicsNextBtn.disabled = !basicsFieldsValid || basicsNextBusy;
	}

	function syncBasicsFields() {
		basicsFieldsValid = validateBasicsFieldsOnly();
		var fp = addressFingerprint(getBasicsAddress());
		if (suggestDismissedFor && suggestDismissedFor !== fp) {
			suggestDismissedFor = '';
			hideAddressSuggestion();
		}
		syncBasicsNext();
	}

	function advanceFromBasics() {
		wizardStarted = true;
		if (startedAt && !startedAt.value) startedAt.value = String(Math.floor(Date.now() / 1000));
		showScreen(1);
	}

	async function handleBasicsNext() {
		if (basicsNextBtn && basicsNextBtn.disabled) return;
		if (!validateBasicsFieldsOnly() || !validateScreen(0, true)) return;

		var currentAddr = getBasicsAddress();
		var fp = addressFingerprint(currentAddr);

		if (suggestDismissedFor === fp) {
			advanceFromBasics();
			return;
		}

		if (pendingSuggestedAddress) {
			showAddressSuggestion(pendingSuggestedAddress);
			return;
		}

		basicsNextBusy = true;
		syncBasicsNext();

		var suggested = await fetchAddressSuggestion(currentAddr);
		basicsNextBusy = false;
		syncBasicsNext();

		if (suggested && addressesMeaningfullyDiffer(currentAddr, suggested)) {
			showAddressSuggestion(suggested);
			return;
		}

		advanceFromBasics();
	}

	function labelFor(name) {
		var el = form.querySelector('[name="' + name + '"]');
		if (!el) return name;
		var field = el.closest('.ws-field');
		if (field) {
			var lbl = field.querySelector('label');
			if (lbl) return lbl.textContent.replace(/\*/g, '').trim();
		}
		return name;
	}

	function valueFor(name) {
		var els = form.querySelectorAll('[name="' + name + '"]');
		if (!els.length) return '';
		if (els[0].type === 'file') return els[0].files && els[0].files[0] ? els[0].files[0].name : '';
		if (els[0].type === 'checkbox' && name.indexOf('[]') === -1) return els[0].checked ? 'Yes' : 'No';
		if (name === 'gig_platforms[]') {
			return Array.prototype.slice.call(form.querySelectorAll('input[name="gig_platforms[]"]:checked')).map(function (c) {
				return c.parentElement.textContent.trim();
			}).join(', ');
		}
		var el = form.querySelector('[name="' + name + '"]');
		if (!el) return '';
		if (el.tagName === 'SELECT') {
			var opt = el.options[el.selectedIndex];
			return opt && opt.value ? opt.text : '';
		}
		return el.value;
	}

	function buildReview() {
		if (!reviewEl) return;
		var rows = [
			['first_name', 0], ['last_name', 0], ['email', 0], ['phone_mobile', 0],
			['address_line1', 0], ['address_line2', 0], ['city', 0], ['state', 0], ['postal_code', 0],
			['has_vehicle', 1], ['can_deliver', 1], ['delivery_max_distance', 1], ['clean_driving_record', 1], ['has_large_format_printer', 1], ['printer_size', 1],
			['gift_wrapping_experience', 2], ['business_structure', 2],
			['bank_account_ready', 3], ['wrrapd_po_daily_pickup', 3], ['dedicated_wrap_workspace', 3], ['comfortable_video_monitoring', 3], ['delivery_proof_ready', 3], ['gov_id', 3],
			['why_wrapstar', 4]
		];
		var html = '<dl>';
		rows.forEach(function (row) {
			var val = valueFor(row[0]);
			if (!val) return;
			html += '<dt>' + labelFor(row[0]) + '</dt><dd>' + val.replace(/</g, '&lt;') + ' <button type="button" class="wrrapd-apply-edit" data-goto="' + row[1] + '">Edit</button></dd>';
		});
		var gig = valueFor('gig_platforms[]');
		if (gig) html += '<dt>Gig platforms</dt><dd>' + gig + ' <button type="button" class="wrrapd-apply-edit" data-goto="2">Edit</button></dd>';
		html += '</dl>';
		reviewEl.innerHTML = html;
		reviewEl.querySelectorAll('.wrrapd-apply-edit').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var target = parseInt(btn.getAttribute('data-goto'), 10);
				if (target > 0) wizardStarted = true;
				showScreen(target);
			});
		});
	}

	function bindConditional(selectId, wrapId, fieldId, showValue) {
		var sel = document.getElementById(selectId);
		var wrap = document.getElementById(wrapId);
		var field = fieldId ? document.getElementById(fieldId) : null;
		if (!sel || !wrap) return;
		function sync() {
			var on = sel.value === showValue;
			wrap.hidden = !on;
			if (field) {
				field.required = on;
				if (!on) field.value = '';
			}
		}
		sel.addEventListener('change', sync);
		sync();
	}

	function mapStateToSelect(abbr) {
		var stateSel = document.getElementById('wrrapd-ws-state');
		if (!stateSel || !abbr) return;
		var up = String(abbr).toUpperCase();
		if (up.length > 2) {
			var map = {
				FLORIDA: 'FL',
				GEORGIA: 'GA'
			};
			up = map[up] || up;
		}
		stateSel.value = (up === 'FL' || up === 'GA') ? up : 'OTHER';
		stateSel.dispatchEvent(new Event('change'));
	}

	function parseAddressComponents(components) {
		var streetNumber = '';
		var route = '';
		var city = '';
		var state = '';
		var postal = '';
		var line2 = '';
		(components || []).forEach(function (c) {
			var types = c.types || c.componentType || [];
			var longName = c.long_name || c.longText || '';
			var shortName = c.short_name || c.shortText || '';
			if (types.indexOf('street_number') !== -1) streetNumber = longName;
			if (types.indexOf('route') !== -1) route = longName;
			if (types.indexOf('subpremise') !== -1) line2 = longName;
			if (types.indexOf('locality') !== -1) city = longName;
			if (!city && types.indexOf('postal_town') !== -1) city = longName;
			if (!city && types.indexOf('sublocality') !== -1) city = longName;
			if (types.indexOf('administrative_area_level_1') !== -1) state = shortName;
			if (types.indexOf('postal_code') !== -1) postal = longName;
		});
		return {
			line1: [streetNumber, route].filter(Boolean).join(' ').trim(),
			line2: line2,
			city: city,
			state: state,
			postal_code: postal
		};
	}

	function fillFromParsedAddress(parsed) {
		var line1 = document.getElementById('ws-address-line1');
		var line2 = document.getElementById('ws-address-line2');
		var cityEl = document.getElementById('ws-city');
		var zipEl = document.getElementById('ws-postal-code');
		if (parsed.line1 && line1) line1.value = parsed.line1;
		if (line2 && parsed.line2) line2.value = parsed.line2;
		if (parsed.city && cityEl) cityEl.value = parsed.city;
		if (parsed.state) mapStateToSelect(parsed.state);
		if (parsed.postal_code && zipEl) zipEl.value = phoneDigits(parsed.postal_code).substring(0, 5);
		syncBasicsFields();
	}

	function fillFromPlace(place) {
		if (!place) return;
		fillFromParsedAddress(parseAddressComponents(place.address_components || place.addressComponents));
	}

	async function fetchProxyPredictions(query) {
		if (!ajaxUrl || !placesNonce) return [];
		var url = ajaxUrl + '?action=wrrapd_ws_places_autocomplete&nonce=' + encodeURIComponent(placesNonce) +
			'&input=' + encodeURIComponent(query);
		var response = await fetch(url);
		if (!response.ok) return [];
		var data = await response.json();
		if (!data || !data.success || !data.data || !data.data.predictions) return [];
		return data.data.predictions;
	}

	async function fetchProxyPlaceDetails(placeId) {
		if (!ajaxUrl || !placesNonce || !placeId) return null;
		var url = ajaxUrl + '?action=wrrapd_ws_places_details&nonce=' + encodeURIComponent(placesNonce) +
			'&place_id=' + encodeURIComponent(placeId);
		var response = await fetch(url);
		if (!response.ok) return null;
		var data = await response.json();
		if (!data || !data.success || !data.data) return null;
		return data.data;
	}

	function setupAddressAutocomplete() {
		var line1 = document.getElementById('ws-address-line1');
		var listEl = document.getElementById('ws-address-suggestions');
		if (!line1 || !listEl || !ajaxUrl || !placesNonce) return;

		var debounce;
		var seq = 0;

		function hideList() {
			listEl.hidden = true;
			listEl.innerHTML = '';
		}

		line1.addEventListener('input', function () {
			clearTimeout(debounce);
			var q = line1.value.trim();
			syncBasicsFields();
			if (q.length < 2) {
				hideList();
				return;
			}
			debounce = setTimeout(async function () {
				var currentSeq = ++seq;
				var predictions = [];
				try {
					predictions = await fetchProxyPredictions(q);
				} catch (e) {
					predictions = [];
				}
				if (currentSeq !== seq) return;
				if (!predictions.length) {
					hideList();
					return;
				}
				listEl.innerHTML = '';
				predictions.slice(0, 8).forEach(function (pred) {
					var li = document.createElement('li');
					li.setAttribute('role', 'option');
					li.textContent = pred.description;
					li.addEventListener('mousedown', function (e) {
						e.preventDefault();
						fetchProxyPlaceDetails(pred.placeId).then(function (place) {
							if (place) fillFromPlace(place);
						});
						hideList();
					});
					listEl.appendChild(li);
				});
				listEl.hidden = listEl.childNodes.length === 0;
			}, 150);
		});

		line1.addEventListener('blur', function () { setTimeout(hideList, 220); });
		line1.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideList(); });
	}

	bindConditional('wrrapd-ws-can-deliver', 'wrrapd-ws-delivery-distance-wrap', 'wrrapd-ws-delivery-distance', 'yes');
	bindConditional('wrrapd-ws-has-printer', 'wrrapd-ws-printer-size-wrap', 'wrrapd-ws-printer-size', 'yes');
	bindConditional('wrrapd-ws-business-structure', 'wrrapd-ws-business-note-wrap', 'wrrapd-ws-business-note', 'other');

	bindPhoneMask('ws-phone-mobile');
	bindPhoneMask('ws-phone-work');

	var stateSel = document.getElementById('wrrapd-ws-state');
	var stateNote = document.getElementById('wrrapd-ws-state-note');
	if (stateSel && stateNote) {
		stateSel.addEventListener('change', function () {
			stateNote.hidden = stateSel.value !== 'OTHER';
			syncBasicsFields();
		});
	}

	var basicsScreen = screens[0];
	if (basicsScreen) {
		fieldsInScreen(basicsScreen).forEach(function (el) {
			el.addEventListener('input', syncBasicsFields);
			el.addEventListener('change', syncBasicsFields);
		});
	}

	if (basicsNextBtn) {
		basicsNextBtn.addEventListener('click', function () {
			handleBasicsNext();
		});
	}

	if (suggestUseBtn) {
		suggestUseBtn.addEventListener('click', function () {
			if (!pendingSuggestedAddress) return;
			applySuggestedAddress(pendingSuggestedAddress);
			advanceFromBasics();
		});
	}

	if (suggestKeepBtn) {
		suggestKeepBtn.addEventListener('click', function () {
			suggestDismissedFor = addressFingerprint(getBasicsAddress());
			hideAddressSuggestion();
			advanceFromBasics();
		});
	}

	if (backBtn) {
		backBtn.addEventListener('click', function () {
			if (current > 1) showScreen(current - 1);
			else if (current === 1) { wizardStarted = false; showScreen(0); }
		});
	}

	if (nextBtn) {
		nextBtn.addEventListener('click', function () {
			if (!validateScreen(current, true)) return;
			if (current < screens.length - 1) showScreen(current + 1);
		});
	}

	setupAddressAutocomplete();

	screens.forEach(function (s, i) { s.hidden = i !== 0; });
	showScreen(0);
	syncBasicsFields();
})();

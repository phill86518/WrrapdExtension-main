/**
 * Canonical Wrrapd occasion labels.
 *
 * MUST stay in sync with:
 *   - CANONICAL_OCCASIONS in backend/wrrapd-api-repo/WrrapdServer/server.js
 *   - wrrapd_occasion_canonical() in wordpress/wrrapd-orders-bridge.php
 *
 * These are the only values that surface in the Occasion dropdown on the
 * Wrrapd website, so the extension must submit one of these exact strings.
 */
export const WRRAPD_OCCASIONS = [
  "Birthday",
  "Christmas",
  "Anniversary",
  "Father's Day",
  "Mother's Day",
  "Valentine's Day",
  "Graduation",
  "Thank you",
  "Thanksgiving",
  "Easter",
  "Hanukkah",
  "Wedding",
  "Retirement",
  "July Fourth",
  "Corporate Gift",
  "St. Patrick's Day",
  "Diwali",
  "Ramadan / Eid",
  "Chinese New Year",
  "Housewarming",
  "New baby",
  "Sympathy",
  "Get well",
  "Congratulations",
  "Just because",
  "Other",
];

/** Default (unselected) label shown at the top of every occasion dropdown. */
export const OCCASION_PLACEHOLDER = "Select Occasion";

/**
 * Build an HTML `<option>` string for embedding inside an innerHTML template.
 * Used by retailers that build markup via template literals (e.g. Amazon).
 * @param {string} [selected] currently-selected occasion (re-selects on restore)
 */
export function occasionOptionsHtml(selected = "") {
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const placeholder = `<option value="" ${selected ? "" : "selected"}>${OCCASION_PLACEHOLDER}</option>`;
  const options = WRRAPD_OCCASIONS.map(
    (label) => `<option value="${esc(label)}"${label === selected ? " selected" : ""}>${esc(label)}</option>`,
  ).join("");
  return placeholder + options;
}

/**
 * Build a real `<select>` element (default "Select Occasion").
 * Used by retailers that build the DOM imperatively (LEGO + shared opt-in).
 * @param {object} [opts]
 * @param {string} [opts.selected] occasion to pre-select on restore
 * @param {string} [opts.id] element id
 * @returns {HTMLSelectElement}
 */
export function buildOccasionSelect({ selected = "", id = "" } = {}) {
  const sel = document.createElement("select");
  if (id) sel.id = id;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = OCCASION_PLACEHOLDER;
  sel.appendChild(placeholder);
  for (const label of WRRAPD_OCCASIONS) {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = selected || "";
  return sel;
}

/** True when `value` is a valid (non-placeholder) canonical occasion. */
export function isValidOccasion(value) {
  return WRRAPD_OCCASIONS.includes(String(value || ""));
}

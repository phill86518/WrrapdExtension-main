import { extensionConfig } from "./extension-config.js";

/** Occasion labels come from /api/extension-config. */
export function occasionList() {
  const list = extensionConfig()?.occasions;
  return Array.isArray(list) ? list : [];
}

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
  const options = occasionList().map(
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
  for (const label of occasionList()) {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = selected || "";
  return sel;
}

/** Refill a select after /api/extension-config arrives. */
export function refreshOccasionSelect(sel, selected = "") {
  if (!sel) return;
  const keep = selected || sel.value || "";
  while (sel.firstChild) sel.removeChild(sel.firstChild);
  const rebuilt = buildOccasionSelect({ selected: keep, id: sel.id });
  while (rebuilt.firstChild) sel.appendChild(rebuilt.firstChild);
  sel.value = occasionList().includes(keep) ? keep : "";
}

/** True when `value` is a valid (non-placeholder) canonical occasion. */
export function isValidOccasion(value) {
  return occasionList().includes(String(value || ""));
}

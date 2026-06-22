/** Same asset as pay.wrrapd.com checkout and tracking Command Center. */
export const WRRAPD_LOGO_URL = "https://pay.wrrapd.com/img/wrrapd-logo-1-small.png";

/** @param {number} [heightPx] */
export function createWrrapdBrandLogo(heightPx = 22) {
  const img = document.createElement("img");
  img.src = WRRAPD_LOGO_URL;
  img.alt = "Wrrapd";
  img.setAttribute("data-wrrapd-brand-logo", "1");
  img.style.cssText = [
    "display:block",
    `height:${heightPx}px`,
    "width:auto",
    "max-width:280px",
    "object-fit:contain",
    // Don't let flit/flex parents squash or stretch the wordmark, and keep it optically
    // centered against the text that sits beside it.
    "flex:0 0 auto",
    "vertical-align:middle",
  ].join(";");
  return img;
}

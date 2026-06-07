/**
 * Canonical Wrrapd Terms & Conditions, mirroring the full 17-point Amazon
 * checkout T&C (content-legacy.js) but parameterized by retailer so every
 * retailer surface shows the same complete legal text, customized.
 */

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns the inner HTML for the scrollable T&C body (heading + 17 clauses).
 * @param {string} retailerLabel e.g. "Etsy", "Sephora", "LEGO"
 */
export function buildWrrapdTermsHtml(retailerLabel) {
  const r = escapeHtml(retailerLabel || "the retailer");
  const p = (n, html) =>
    `<p style="margin-bottom:16px;"><strong>${n}.</strong> ${html}</p>`;
  return `
    <h1 style="margin:0 0 8px;font-size:26px;text-align:center;font-weight:600;color:#2c3e50;letter-spacing:.5px;">Wrrapd Inc. Terms &amp; Conditions</h1>
    <p style="margin:0 0 22px;text-align:center;color:#334155;"><em>Gift wrap &amp; fulfillment — ${r} orders</em></p>
    <div style="font-size:15px;line-height:1.9;color:#2c3e50;">
      ${p(1, `Scope of Service: These Terms &amp; Conditions (&quot;Terms&quot;) apply solely to the gift-wrapping and related fulfillment services provided by Wrrapd Inc. (&quot;Wrrapd&quot;). Your purchase of any underlying items is governed solely by ${r}&apos;s Terms &amp; Conditions.`)}
      ${p(2, `Eligibility: You must be at least 18 years old or the age of majority in your jurisdiction to utilize the Wrrapd gift-wrapping service.`)}
      ${p(3, `Privacy Policy: Your use of the service is subject to Wrrapd&apos;s Privacy Policy, found at <a href="https://www.wrrapd.com/privacy" target="_blank" rel="noopener" style="color:#0066c0;text-decoration:none;">https://www.wrrapd.com/privacy</a>.`)}
      ${p(4, `Limited Agency Appointment: By using the Wrrapd browser extension and clicking the agreement button, you explicitly appoint Wrrapd Inc. as your Limited Agent and Attorney-in-Fact for the sole purpose of navigating the ${r} interface and entering delivery information on your behalf. Wrrapd acts only at your specific direction and under your direct supervision.`)}
      ${p(5, `Platform Risk &amp; Account Health: You acknowledge that ${r}&apos;s policies regarding third-party agents, automation, and shipment destinations are evolving platform rules. You agree to assume all risks regarding your ${r} account status, including potential flags or the voiding of ${r}-specific guarantees once an item is delivered to our hub.`)}
      ${p(6, `Description of Service: You acknowledge that Wrrapd provides professional exterior gift-wrapping and may include personalized options (e.g., messages, custom/AI designs, tags, or flowers).`)}
      ${p(7, `Fees and Taxes: You acknowledge that the Wrrapd service fee and any applicable taxes are clearly displayed at the time of selection, and by completing the order, you accept and agree to pay these amounts.`)}
      ${p(8, `Delivery Timelines: Selecting Wrrapd may add at least one business day to ${r}&apos;s estimated delivery date. An additional day is often required for the wrapping process, particularly for items received after 2:00 p.m. local time.`)}
      ${p(9, `Third-Party Delays: You agree not to hold Wrrapd responsible for any delays resulting from the late delivery of items from ${r} or its third-party sellers to Wrrapd&apos;s facilities.`)}
      ${p(10, `Video Audit Trail: Wrrapd provides high-fidelity Video Proof for every order, including (a) receipt of the ${r} package, (b) the unpackaging process, (c) the gift-wrapping process, and (d) final delivery to the outbound carrier. This record serves as definitive evidence of our service fulfillment.`)}
      ${p(11, `No Product Inspection: Wrrapd does not inspect, open, or handle the contents of ${r}-purchased items prior to the wrapping stage. Wrrapd is not responsible for any damage to the underlying product, defects, missing parts, or incorrect items sent by ${r} or its sellers.`)}
      ${p(12, `Indemnification: You agree to indemnify and hold harmless Wrrapd Inc. from any claims or losses arising from the condition or quality of the underlying product, your use of the service, or your violation of these Terms.`)}
      ${p(13, `Product Issues &amp; Returns: All issues relating to the product itself must be addressed directly with ${r} or the seller. Since you remain the owner of the product, you are responsible for initiating any returns through ${r}&apos;s standard channels using our provided video evidence if necessary.`)}
      ${p(14, `Refund Policy: Gift-wrapping fees are non-refundable except in limited cases: (a) damage to the gift-wrap itself during transit; or (b) failure to ship the wrapped item within our promised window. Service fees are not refundable once the wrapping process has been documented.`)}
      ${p(15, `Prohibited Conduct: You agree not to provide false or misleading information or use the service for any fraudulent or illegal purposes.`)}
      ${p(16, `Warranties and Liability: The service is provided &quot;AS IS.&quot; Wrrapd&apos;s total liability is limited to the service fee paid. We are not liable for indirect, incidental, or consequential damages.`)}
      ${p(17, `Dispute Resolution &amp; Governing Law: Any disputes will be resolved through binding individual arbitration in Jacksonville, Florida. You waive the right to a jury trial or class action. These Terms are governed by the laws of the State of Florida, USA.`)}
    </div>`;
}

import QRCode from "qrcode";
import { sendTransactionalEmail, type EmailAttachment } from "./customer-notify";
import { driverLabelScanUrl } from "./driver-label-qr";
import { formatDateKeyNy } from "./ny-date";
import { ensureDaySheet, markMorningEmailSent } from "./shift-store";
import { listRegisteredWrapstars } from "./wrapstar-registry";
import { wrappingPaperName } from "./gift-box";
import type { WrapShiftItem, WrapStar } from "./types";

function itemBlock(item: WrapShiftItem): string {
  const box = item.needsBox
    ? `Box needed before you cut the paper${item.boxSize ? `: ${escapeHtml(item.boxSize)}` : "."}`
    : item.boxSize && !/estimate/i.test(item.boxSize)
      ? `No extra box. Package is ${escapeHtml(item.boxSize)}.`
      : "No extra box.";
  const cid = `${item.code}.png`;
  const custom = item.customPrint
    ? `Custom wrap. Print this file before you wrap.${
        item.printFileUrl
          ? ` <a href="${escapeHtml(item.printFileUrl)}">Open the wrap file</a>.`
          : ""
      }`
    : "Standard wrap paper.";
  return `
    <li style="margin:0 0 16px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;">
      <img src="cid:${escapeHtml(cid)}" alt="${escapeHtml(item.code)}" width="180" height="180" />
      <p style="margin:8px 0 0;font-size:18px;font-weight:700;letter-spacing:0.08em;">${escapeHtml(item.code)}</p>
      <p style="margin:6px 0 0;">${escapeHtml(item.title)}</p>
      <p style="margin:4px 0 0;">Occasion: ${escapeHtml(item.occasion || "—")}</p>
      <p style="margin:4px 0 0;">Paper: ${escapeHtml(wrappingPaperName({ wrappingOption: item.wrappingPaper, occasion: item.occasion }))}</p>
      <p style="margin:4px 0 0;">${custom}</p>
      <p style="margin:4px 0 0;">${box}</p>
      ${item.needsBox ? `<p style="margin:4px 0 0;">Tissue: 1 sheet</p>` : ""}
    </li>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendMorningWrapSheets(dateKey = formatDateKeyNy(new Date())): Promise<{
  dateKey: string;
  sent: { wrapstarId: string; email: string; items: number }[];
  skipped: { wrapstarId: string; reason: string }[];
}> {
  const wrapstars = await listRegisteredWrapstars();
  const sent: { wrapstarId: string; email: string; items: number }[] = [];
  const skipped: { wrapstarId: string; reason: string }[] = [];

  for (const wrapstar of wrapstars) {
    const result = await sendOneMorningSheet(wrapstar, dateKey);
    if (result.ok) sent.push(result.row);
    else skipped.push({ wrapstarId: wrapstar.id, reason: result.reason });
  }
  return { dateKey, sent, skipped };
}

async function sendOneMorningSheet(
  wrapstar: WrapStar,
  dateKey: string,
): Promise<
  | { ok: true; row: { wrapstarId: string; email: string; items: number } }
  | { ok: false; reason: string }
> {
  const email = wrapstar.email?.trim();
  if (!email) return { ok: false, reason: "No email on file." };
  const sheet = await ensureDaySheet(wrapstar.id, dateKey);
  const items = sheet?.items || [];
  if (!sheet || items.length === 0) return { ok: false, reason: "No gifts today." };
  const attachments: EmailAttachment[] = [];
  for (const item of items) {
    const png = await QRCode.toBuffer(driverLabelScanUrl(item.scanToken), {
      type: "png",
      width: 360,
      margin: 1,
    });
    attachments.push({
      filename: `${item.code}.png`,
      content: png,
      cid: `${item.code}.png`,
      contentType: "image/png",
    });
  }
  const html = `
    <div style="font-family:Georgia,serif;color:#0f172a;">
      <p>Good morning${wrapstar.name ? `, ${escapeHtml(wrapstar.name.split(" ")[0] || "")}` : ""}.</p>
      <p>These are today's gifts. Each one has its own code. Scan that code in the WrapStar app to open it. When the gift is wrapped, print that same code and stick it on the outside of the original packaging. Do not tape the box yet.</p>
      <p>Open the app and tap <strong>Start shift</strong> when you begin. Pay is $30.00 per dozen finished wraps (prorated for fewer or more than a dozen), plus a $15.00 bonus upon every 100 wrapped boxes. Clock time does not change it.</p>
      <p>If a gift needs a box, pick that box up after the camera is on and before you cut the paper.</p>
      <ul style="list-style:none;padding:0;">${items.map(itemBlock).join("")}</ul>
    </div>`;
  const ok = await sendTransactionalEmail({
    to: email,
    subject: `Today's gifts to wrap · ${dateKey}`,
    html,
    attachments,
  });
  if (!ok) return { ok: false, reason: "Email could not be sent." };
  await markMorningEmailSent(sheet.id);
  return { ok: true, row: { wrapstarId: wrapstar.id, email, items: items.length } };
}

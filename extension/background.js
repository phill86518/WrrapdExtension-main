const INSTALL_KEY = "wrrapdInstall";
const HEARTBEAT_DAY_KEY = "wrrapdHeartbeatDay";

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender?.origin || sender?.url || "";
  const isWrrapd = /^https:\/\/(www\.)?wrrapd\.com(\/|$)/i.test(origin);

  if (!isWrrapd || !message || message.type !== "WRRAPD_PING") {
    return false;
  }

  sendResponse({
    ok: true,
    wrrapd: true,
    version: chrome.runtime.getManifest().version,
  });
  return false;
});

async function ensureInstall() {
  const cur = await chrome.storage.local.get(INSTALL_KEY);
  const existing = cur[INSTALL_KEY];
  if (existing && typeof existing.installId === "string" && existing.installId) return existing;
  const row = {
    installId: crypto.randomUUID(),
    firstSeen: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [INSTALL_KEY]: row });
  return row;
}

async function heartbeat() {
  try {
    const row = await ensureInstall();
    const day = new Date().toISOString().slice(0, 10);
    const stamp = await chrome.storage.local.get(HEARTBEAT_DAY_KEY);
    if (stamp[HEARTBEAT_DAY_KEY] === day) return;
    const res = await fetch("https://api.wrrapd.com/extension-heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installId: row.installId,
        extensionVersion: chrome.runtime.getManifest().version,
        firstSeen: row.firstSeen,
      }),
    });
    if (res.ok) await chrome.storage.local.set({ [HEARTBEAT_DAY_KEY]: day });
  } catch {
    /* next browser start retries */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  heartbeat();
});
chrome.runtime.onStartup.addListener(() => {
  heartbeat();
});
heartbeat();

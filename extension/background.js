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

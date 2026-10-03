/** Random install id created by the background worker. Empty until storage is ready. */
export async function readInstallId() {
  try {
    const cur = await chrome.storage.local.get("wrrapdInstall");
    const id = cur?.wrrapdInstall?.installId;
    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}

/** Former employees — never To/CC/BCC on transactional or ops mail. */
export const DEPARTED_STAFF_EMAILS = new Set(["angel@wrrapd.com"]);

export function isDepartedStaffEmail(email: string | undefined): boolean {
  return DEPARTED_STAFF_EMAILS.has(String(email || "").trim().toLowerCase());
}

export function filterLiveRecipients(emails: string[]): string[] {
  return emails
    .map((e) => e.trim())
    .filter((e) => e && !isDepartedStaffEmail(e));
}

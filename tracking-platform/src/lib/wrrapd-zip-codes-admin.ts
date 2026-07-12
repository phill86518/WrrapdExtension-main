export type AllowedZipCodesPayload = {
  allowedZipCodes: string[];
  count: number;
  updatedAt: string | null;
  notes?: string | null;
};

export type ZipCheckResult = {
  postalCode: string;
  allowed: boolean;
  geo: { zip: string; state: string; county: string } | null;
};

function apiBase(): string {
  return (process.env.WRRAPD_API_BASE_URL || "https://api.wrrapd.com").replace(/\/$/, "");
}

function adminHeaders(): HeadersInit {
  const key = (process.env.WRRAPD_ADMIN_API_KEY || "").trim();
  if (!key) {
    throw new Error("WRRAPD_ADMIN_API_KEY is not set on the tracking platform");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function fetchAllowedZipCodes(): Promise<AllowedZipCodesPayload> {
  const r = await fetch(`${apiBase()}/api/admin/allowed-zip-codes`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return {
    allowedZipCodes: Array.isArray(body.allowedZipCodes) ? body.allowedZipCodes : [],
    count: typeof body.count === "number" ? body.count : 0,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

export async function replaceAllowedZipCodes(
  allowedZipCodes: string[],
  notes?: string,
): Promise<AllowedZipCodesPayload> {
  const r = await fetch(`${apiBase()}/api/admin/allowed-zip-codes`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ allowedZipCodes, notes }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return {
    allowedZipCodes: Array.isArray(body.allowedZipCodes) ? body.allowedZipCodes : [],
    count: typeof body.count === "number" ? body.count : 0,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

export async function addAllowedZipCodes(zipCodes: string[]): Promise<AllowedZipCodesPayload & { added: number }> {
  const r = await fetch(`${apiBase()}/api/admin/allowed-zip-codes/add`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ zipCodes }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return {
    added: typeof body.added === "number" ? body.added : 0,
    allowedZipCodes: Array.isArray(body.allowedZipCodes) ? body.allowedZipCodes : [],
    count: typeof body.count === "number" ? body.count : 0,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
  };
}

export async function removeAllowedZipCodes(
  zipCodes: string[],
): Promise<AllowedZipCodesPayload & { removed: number }> {
  const r = await fetch(`${apiBase()}/api/admin/allowed-zip-codes/remove`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ zipCodes }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return {
    removed: typeof body.removed === "number" ? body.removed : 0,
    allowedZipCodes: Array.isArray(body.allowedZipCodes) ? body.allowedZipCodes : [],
    count: typeof body.count === "number" ? body.count : 0,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
  };
}

export async function checkAllowedZipCode(postalCode: string): Promise<ZipCheckResult> {
  const u = new URL(`${apiBase()}/api/admin/allowed-zip-codes/check`);
  u.searchParams.set("postalCode", postalCode);
  const r = await fetch(u.toString(), {
    headers: adminHeaders(),
    cache: "no-store",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return body.result as ZipCheckResult;
}

export async function seedAllowedZipCodesStates(
  states: string[] = ["FL", "GA"],
): Promise<AllowedZipCodesPayload> {
  const r = await fetch(`${apiBase()}/api/admin/allowed-zip-codes/seed-states`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ states }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return {
    allowedZipCodes: Array.isArray(body.allowedZipCodes) ? body.allowedZipCodes : [],
    count: typeof body.count === "number" ? body.count : 0,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

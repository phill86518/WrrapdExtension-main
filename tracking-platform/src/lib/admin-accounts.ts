/**
 * Personal Command Center admin logins: email + password (scrypt) + 6-digit authenticator code (TOTP, RFC 6238).
 * Once at least one admin is enrolled, the shared APP_ADMIN_PASSWORD no longer opens Command Center.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { trackingAdminUsersCollection } from "@/lib/tracking-firestore";

export type AdminUser = {
  email: string;
  name: string;
  passwordHash: string;
  totpSecret: string;
  createdAt: string;
  createdBy: string;
  disabled?: boolean;
  lastLoginAt?: string;
  failedAttempts?: number;
  lockedUntil?: string;
  /** Last accepted TOTP time step — a code cannot be replayed. */
  lastTotpStep?: number;
};

const MAX_FAILED = 8;
const LOCK_MS = 15 * 60 * 1000;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const want = Buffer.from(hashB64, "base64");
  const got = scryptSync(password, Buffer.from(saltB64, "base64"), want.length);
  return timingSafeEqual(want, got);
}

export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Accepts the current 30-second code or one step either side; returns the matched step or null. */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return null;
  const step = Math.floor(now / 30_000);
  for (const s of [step, step - 1, step + 1]) {
    if (timingSafeEqual(Buffer.from(totpAt(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}

export function totpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Wrrapd Command Center:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("Wrrapd")}&algorithm=SHA1&digits=6&period=30`;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const col = trackingAdminUsersCollection();
  if (!col) return [];
  const snap = await col.get();
  return snap.docs.map((d) => d.data() as AdminUser);
}

export async function adminAccountsEnrolled(): Promise<boolean> {
  const col = trackingAdminUsersCollection();
  if (!col) return false;
  const snap = await col.where("disabled", "==", false).limit(1).get();
  return !snap.empty;
}

export async function saveAdminUser(user: AdminUser): Promise<void> {
  const col = trackingAdminUsersCollection();
  if (!col) throw new Error("Firestore is not configured");
  await col.doc(normEmail(user.email)).set(user);
}

export async function setAdminDisabled(email: string, disabled: boolean): Promise<void> {
  const col = trackingAdminUsersCollection();
  if (!col) throw new Error("Firestore is not configured");
  await col.doc(normEmail(email)).set({ disabled }, { merge: true });
}

export type AdminLoginResult = { ok: true; user: AdminUser } | { ok: false; error: "invalid" | "locked" };

export async function checkAdminLogin(email: string, password: string, code: string): Promise<AdminLoginResult> {
  const col = trackingAdminUsersCollection();
  if (!col) return { ok: false, error: "invalid" };
  const ref = col.doc(normEmail(email));
  const snap = await ref.get();
  const user = snap.exists ? (snap.data() as AdminUser) : null;
  if (!user || user.disabled) {
    // Same work as a real check so timing does not reveal which emails exist.
    passwordMatches(password, hashPassword("decoy"));
    return { ok: false, error: "invalid" };
  }
  if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) return { ok: false, error: "locked" };
  const step = passwordMatches(password, user.passwordHash) ? verifyTotp(user.totpSecret, code) : null;
  if (step == null || (user.lastTotpStep != null && step <= user.lastTotpStep)) {
    const failed = (user.failedAttempts || 0) + 1;
    await ref.set(
      {
        failedAttempts: failed >= MAX_FAILED ? 0 : failed,
        ...(failed >= MAX_FAILED ? { lockedUntil: new Date(Date.now() + LOCK_MS).toISOString() } : {}),
      },
      { merge: true },
    );
    return { ok: false, error: failed >= MAX_FAILED ? "locked" : "invalid" };
  }
  await ref.set(
    { failedAttempts: 0, lockedUntil: null, lastTotpStep: step, lastLoginAt: new Date().toISOString() },
    { merge: true },
  );
  return { ok: true, user };
}

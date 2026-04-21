import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { trackingRuntimeDoc } from "./tracking-firestore";

export const SESSION_COOKIE_NAME = "wrrapd_session";

type Session = {
  role: "admin" | "driver";
  userId: string;
  name: string;
};

const secret = new TextEncoder().encode(
  process.env.APP_SESSION_SECRET || "local-dev-secret-change-in-prod",
);
const dataDir = path.join(process.cwd(), ".data");
const authFilePath = path.join(dataDir, "auth.json");
const defaultDriverPassword = process.env.APP_DRIVER_PASSWORD || "driver123";

/** Admin + driver JWT and browser cookie lifetime (keep in sync). */
const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

export async function createSessionToken(session: Session) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  return await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    /** Without maxAge, many browsers treat this as a session cookie and drop it on tab close or under memory pressure. */
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

/**
 * Route handlers that return NextResponse.redirect() or NextResponse.json() must attach
 * the session cookie to that response — cookies().set() from next/headers does not apply.
 */
export function applySessionCookieToResponse(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookieOnResponse(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret);
    return payload as Session;
  } catch {
    return null;
  }
}

export async function requireAdminSession() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function requireDriverSession() {
  const session = await getSession();
  if (!session || session.role !== "driver") return null;
  return session;
}

async function ensureAuthFile() {
  if (existsSync(authFilePath)) return;
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    authFilePath,
    JSON.stringify({ driverPassword: defaultDriverPassword }, null, 2),
    "utf8",
  );
}

async function readDriverPasswordFromFirestore(): Promise<string | null> {
  const ref = trackingRuntimeDoc();
  if (!ref) return null;
  const snap = await ref.get();
  if (!snap.exists) return null;
  const p = (snap.data() as { driverPassword?: string }).driverPassword?.trim();
  return p && p.length > 0 ? p : null;
}

async function readDriverPassword(): Promise<string> {
  const fromEnv = process.env.APP_DRIVER_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  const fromDb = await readDriverPasswordFromFirestore();
  if (fromDb) return fromDb.trim();
  await ensureAuthFile();
  const raw = await readFile(authFilePath, "utf8");
  const parsed = JSON.parse(raw) as { driverPassword?: string };
  return (parsed.driverPassword || defaultDriverPassword).trim();
}

export async function verifyDriverPassword(password: string) {
  const expected = await readDriverPassword();
  return password.trim() === expected.trim();
}

export async function updateDriverPassword(nextPassword: string) {
  const ref = trackingRuntimeDoc();
  if (ref) {
    await ref.set({ driverPassword: nextPassword }, { merge: true });
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    authFilePath,
    JSON.stringify({ driverPassword: nextPassword }, null, 2),
    "utf8",
  );
}

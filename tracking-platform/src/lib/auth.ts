import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const COOKIE_NAME = "wrrapd_session";

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

export async function createSessionToken(session: Session) {
  return await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
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

async function readDriverPassword(): Promise<string> {
  await ensureAuthFile();
  const raw = await readFile(authFilePath, "utf8");
  const parsed = JSON.parse(raw) as { driverPassword?: string };
  return parsed.driverPassword || defaultDriverPassword;
}

export async function verifyDriverPassword(password: string) {
  return password === (await readDriverPassword());
}

export async function updateDriverPassword(nextPassword: string) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    authFilePath,
    JSON.stringify({ driverPassword: nextPassword }, null, 2),
    "utf8",
  );
}

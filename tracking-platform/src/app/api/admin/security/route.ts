import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import {
  hashPassword,
  listAdminUsers,
  newTotpSecret,
  normEmail,
  saveAdminUser,
  setAdminDisabled,
  totpUri,
  verifyTotp,
} from "@/lib/admin-accounts";
import { getSessionSecretBytes } from "@/lib/session-constants";

export const dynamic = "force-dynamic";

type Pending = { email: string; name: string; passwordHash: string; totpSecret: string };

/**
 * Admin login setup. `start` returns a QR code and a short-lived signed token holding the new account;
 * nothing is saved until `confirm` proves the authenticator app produces a valid code.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  if (action === "start") {
    const email = normEmail(String(body.email || ""));
    const name = String(body.name || "").trim().slice(0, 80);
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
    if (password.length < 12) return NextResponse.json({ error: "Use a password of at least 12 characters." }, { status: 400 });
    const pending: Pending = { email, name, passwordHash: hashPassword(password), totpSecret: newTotpSecret() };
    const token = await new SignJWT({ pending })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(getSessionSecretBytes());
    const uri = totpUri(pending.totpSecret, email);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
    return NextResponse.json({ token, qr, secret: pending.totpSecret });
  }

  if (action === "confirm") {
    let pending: Pending;
    try {
      const { payload } = await jwtVerify(String(body.token || ""), getSessionSecretBytes());
      pending = (payload as { pending: Pending }).pending;
    } catch {
      return NextResponse.json({ error: "Setup expired. Start again." }, { status: 400 });
    }
    const step = verifyTotp(pending.totpSecret, String(body.code || ""));
    if (step == null) return NextResponse.json({ error: "That code did not match. Try the newest code." }, { status: 400 });
    await saveAdminUser({
      ...pending,
      createdAt: new Date().toISOString(),
      createdBy: session.name || session.userId,
      disabled: false,
      failedAttempts: 0,
      lastTotpStep: step,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "disable" || action === "enable") {
    const email = normEmail(String(body.email || ""));
    const users = await listAdminUsers();
    if (!users.some((u) => normEmail(u.email) === email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (action === "disable") {
      const activeOthers = users.filter((u) => !u.disabled && normEmail(u.email) !== email);
      if (activeOthers.length === 0) {
        return NextResponse.json({ error: "Keep at least one active admin login." }, { status: 400 });
      }
    }
    await setAdminDisabled(email, action === "disable");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

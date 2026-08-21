import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getSession, type SessionPayload } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { revokeStaffAuthSessionByJti } from "@/lib/staff-auth-session";
import {
  clearOwnerStashCookie,
  readOwnerStashToken,
  restoreOwnerSessionFromStash,
} from "@/lib/owner-staff-bridge";

function resolveJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET?.trim();
  const isPlaceholder =
    !raw ||
    raw === "dev-secret" ||
    raw.startsWith("change-this") ||
    raw.length < 16;
  if (process.env.NODE_ENV === "production" && isPlaceholder) {
    throw new Error(
      "JWT_SECRET ต้องตั้งค่าที่เป็นความลับและยาวพอใน production",
    );
  }
  return new TextEncoder().encode(raw || "dev-secret-local-only");
}

/**
 * คืนเซสชันเจ้าของร้านที่ stash ไว้หลังขายหน้าร้าน (แม่ค้าคนเดียว)
 */
export async function POST() {
  try {
    const session = await getSession();
    const stash = await readOwnerStashToken();
    if (!stash) {
      return jsonError(
        "ไม่มีเซสชันเจ้าของร้านที่พักไว้ — ล็อกอินใหม่ที่ /owner/login",
        400,
      );
    }

    let adminSession: SessionPayload;
    try {
      const { payload } = await jwtVerify(stash, resolveJwtSecret());
      adminSession = payload as unknown as SessionPayload;
    } catch {
      const res = NextResponse.json(
        { error: "เซสชันเจ้าของหมดอายุ — ล็อกอินใหม่" },
        { status: 401 },
      );
      clearOwnerStashCookie(res);
      return res;
    }

    if (adminSession.type !== "admin" || !adminSession.adminId) {
      const res = NextResponse.json(
        { error: "เซสชันที่พักไว้ไม่ถูกต้อง" },
        { status: 400 },
      );
      clearOwnerStashCookie(res);
      return res;
    }

    if (session?.type === "staff" && session.jti) {
      await revokeStaffAuthSessionByJti(session.jti).catch(() => null);
    }

    const res = NextResponse.json({ ok: true, redirect: "/owner" });
    restoreOwnerSessionFromStash(res, stash);
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}

/** เช็กว่ากดกลับหลังบ้านได้ไหม (มี stash) */
export async function GET() {
  try {
    const stash = await readOwnerStashToken();
    if (!stash) return NextResponse.json({ canReturnToOwner: false });
    try {
      const { payload } = await jwtVerify(stash, resolveJwtSecret());
      const s = payload as unknown as SessionPayload;
      return NextResponse.json({
        canReturnToOwner: s.type === "admin" && Boolean(s.adminId),
      });
    } catch {
      return NextResponse.json({ canReturnToOwner: false });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

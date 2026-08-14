import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { StaffRole } from "./constants";
import { prisma } from "./db";
import { assertStaffAuthSessionLive } from "./staff-auth-session";
import { STAFF_SESSION_MS } from "./staff-session-limits";
import {
  BrandInactiveError,
  brandInactiveMessage,
  effectiveBrandStatus,
  isBrandStorefrontOpen,
} from "./brand-plan-shared";

export const SESSION_COOKIE_NAME = "skillsale_session";

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

let cachedJwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (!cachedJwtSecret) {
    cachedJwtSecret = resolveJwtSecret();
  }
  return cachedJwtSecret;
}

export type SessionPayload = {
  type: "admin" | "staff" | "customer";
  adminId?: string;
  username?: string;
  isPlatformAdmin?: boolean;
  brandIds?: string[];
  staffPhone?: string;
  branchId?: string;
  staffRoles?: StaffRole[];
  branchName?: string;
  /** Staff auth session id — must exist in StaffAuthSession. */
  jti?: string;
  deviceId?: string;
  customerPhone?: string;
  customerId?: string;
  customerName?: string;
};

export function sessionCookieOptions(type?: SessionPayload["type"]) {
  // Customers stay signed in longer so returning to the same site rarely needs OTP again.
  const maxAge =
    type === "customer"
      ? 60 * 60 * 24 * 90 // 90 days
      : type === "staff"
        ? Math.floor(STAFF_SESSION_MS / 1000)
        : 60 * 60 * 24 * 7;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Sign JWT only (set cookie via cookies() or NextResponse). */
export async function signSessionToken(
  payload: SessionPayload,
): Promise<string> {
  // Keep payload small/serializable — avoid embedding large strings in JWT
  const safe: SessionPayload = {
    ...payload,
    branchName: payload.branchName?.slice(0, 120),
    customerName: payload.customerName?.slice(0, 120),
    username: payload.username?.slice(0, 80),
  };
  const expiration =
    payload.type === "customer"
      ? "90d"
      : payload.type === "staff"
        ? "7d"
        : "7d";
  const token = new SignJWT({ ...safe }).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  if (safe.jti) token.setJti(safe.jti);
  return token.setExpirationTime(expiration).sign(getJwtSecret());
}

export async function createSession(payload: SessionPayload) {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(payload.type),
  );
}

/** Prefer this in Route Handlers — attaches Set-Cookie on the response object. */
export async function attachSessionCookie(
  response: NextResponse,
  payload: SessionPayload,
): Promise<NextResponse> {
  const token = await signSessionToken(payload);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(payload.type),
  );
  return response;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.type !== "admin" || !session.adminId) {
    throw new Error("UNAUTHORIZED");
  }

  // Always refresh role/membership from DB (JWT may predate multi-brand fields)
  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    include: { brandMembers: { select: { brandId: true } } },
  });
  if (!admin) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    ...session,
    isPlatformAdmin: admin.isPlatformAdmin,
    brandIds: admin.brandMembers.map((m) => m.brandId),
  };
}

export async function requireStaff() {
  const session = await getSession();
  if (!session || session.type !== "staff" || !session.branchId) {
    throw new Error("UNAUTHORIZED");
  }
  if (!session.jti || !session.staffPhone) {
    throw new Error("UNAUTHORIZED");
  }
  await assertStaffAuthSessionLive({
    jti: session.jti,
    phone: session.staffPhone,
  });

  const staff = await prisma.staff.findFirst({
    where: {
      phone: session.staffPhone,
      branchId: session.branchId,
      isActive: true,
    },
    include: {
      roles: true,
      branch: {
        select: {
          name: true,
          autoAcceptOrders: true,
          brand: {
            select: {
              code: true,
              name: true,
              nameTh: true,
              nameEn: true,
              logoUrl: true,
              coverImageUrl: true,
              color: true,
              siteTitle: true,
              siteDescription: true,
              queueTicketCopies: true,
              status: true,
              trialEndsAt: true,
            },
          },
        },
      },
    },
  });
  if (!staff) {
    throw new Error("UNAUTHORIZED");
  }

  const staffRoles = staff.roles.map((r) => r.role as StaffRole);
  if (staffRoles.length === 0) {
    throw new Error("UNAUTHORIZED");
  }

  const brand = staff.branch.brand;
  if (!brand) {
    throw new Error("UNAUTHORIZED");
  }
  if (!isBrandStorefrontOpen(brand)) {
    throw new BrandInactiveError(
      brandInactiveMessage(effectiveBrandStatus(brand)),
    );
  }

  return {
    ...session,
    staffId: staff.id,
    staffPhone: staff.phone,
    staffDisplayName: staff.name?.trim() || staff.phone,
    staffImageUrl: staff.imageUrl?.trim() || null,
    branchId: staff.branchId,
    staffRoles,
    branchName: staff.branch.name,
    autoAcceptOrders: staff.branch.autoAcceptOrders,
    brand: {
      code: brand.code,
      name: brand.name,
      nameTh: brand.nameTh,
      nameEn: brand.nameEn,
      logoUrl: brand.logoUrl,
      color: brand.color,
      siteTitle: brand.siteTitle,
      siteDescription: brand.siteDescription,
      queueTicketCopies: Math.min(5, Math.max(1, brand.queueTicketCopies ?? 1)),
    },
  };
}

export async function requireCustomer() {
  const session = await getSession();
  if (!session || session.type !== "customer" || !session.customerId) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

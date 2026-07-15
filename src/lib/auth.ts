import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { StaffRole } from "./constants";
import { prisma } from "./db";

const COOKIE_NAME = "skillsale_session";

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

const secret = resolveJwtSecret();

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
  customerPhone?: string;
  customerId?: string;
  customerName?: string;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
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
              color: true,
              siteTitle: true,
              siteDescription: true,
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

  const { brand } = staff.branch;

  return {
    ...session,
    staffPhone: staff.phone,
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

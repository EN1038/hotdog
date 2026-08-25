import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { assertCanCreateStaff } from "@/lib/brand-plan";
import {
  ensureBrandPrimaryAdmin,
  pickPrimaryAdminId,
} from "@/lib/brand-primary-owner";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type SessionPayload,
} from "@/lib/auth";
import { SESSION_MAX_AGE_SEC } from "@/lib/staff-session-limits";

/** Stashed admin JWT while owner sells as staff (sole-operator bridge). */
export const OWNER_STASH_COOKIE_NAME = "skillsale_owner_stash";

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

export async function resolveOwnerPhoneForBrand(brandId: string): Promise<{
  phone: string;
  name: string | null;
  adminId: string;
} | null> {
  await ensureBrandPrimaryAdmin(brandId).catch(() => null);
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { primaryAdminId: true, contactPhone: true, name: true },
  });
  if (!brand) return null;

  const members = await prisma.brandMember.findMany({
    where: { brandId },
    include: {
      admin: {
        select: {
          id: true,
          phone: true,
          username: true,
          isPlatformAdmin: true,
        },
      },
    },
  });
  const primaryId = pickPrimaryAdminId(members, brand.primaryAdminId);
  const primary = members.find((m) => m.admin.id === primaryId)?.admin;
  if (!primary || primary.isPlatformAdmin) return null;

  const candidates = [
    primary.phone,
    brand.contactPhone,
    /^\d{9,}$/.test(primary.username.replace(/\D/g, ""))
      ? primary.username
      : null,
  ];
  let phone = "";
  for (const c of candidates) {
    if (!c) continue;
    const n = normalizePhone(c);
    if (n.length >= 9) {
      phone = n;
      break;
    }
  }
  if (!phone) return null;

  return {
    phone,
    name: brand.name ? `เจ้าของ · ${brand.name}` : primary.username,
    adminId: primary.id,
  };
}

/** Ensure owner phone is active Staff (SELLER) on given branches. */
export async function ensureOwnerStaffOnBranches(opts: {
  brandId: string;
  phone: string;
  name: string | null;
  branchIds: string[];
}) {
  if (opts.branchIds.length === 0) return;
  await assertCanCreateStaff(opts.brandId, { phone: opts.phone });

  const branches = await prisma.branch.findMany({
    where: { brandId: opts.brandId, id: { in: opts.branchIds } },
    select: { id: true, kind: true },
  });

  for (const branch of branches) {
    const roles: StaffRole[] =
      branch.kind === "WAREHOUSE" ? ["SELLER"] : ["SELLER", "DELIVERY"];

    const existing = await prisma.staff.findFirst({
      where: { branchId: branch.id, phone: opts.phone },
      include: { roles: true },
    });

    if (existing) {
      const have = new Set(existing.roles.map((r) => r.role));
      const missing = roles.filter((r) => !have.has(r));
      if (!existing.isActive || missing.length > 0) {
        await prisma.staff.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            name: existing.name || opts.name,
          },
        });
        if (missing.length > 0) {
          await prisma.staffRoleAssignment.createMany({
            data: missing.map((role) => ({
              staffId: existing.id,
              role,
            })),
            skipDuplicates: true,
          });
        }
      }
      continue;
    }

    await prisma.staff.create({
      data: {
        branchId: branch.id,
        phone: opts.phone,
        name: opts.name,
        isActive: true,
        roles: {
          create: roles.map((role) => ({ role })),
        },
      },
    });
  }
}

export function ownerStashCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export async function readSessionCookieToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function readOwnerStashToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(OWNER_STASH_COOKIE_NAME)?.value ?? null;
}

export async function peekOwnerStashIsAdmin(): Promise<boolean> {
  const token = await readOwnerStashToken();
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, resolveJwtSecret());
    const session = payload as unknown as SessionPayload;
    return session.type === "admin" && Boolean(session.adminId);
  } catch {
    return false;
  }
}

export function attachOwnerStashCookie(
  response: NextResponse,
  adminToken: string,
) {
  response.cookies.set(
    OWNER_STASH_COOKIE_NAME,
    adminToken,
    ownerStashCookieOptions(),
  );
}

export function clearOwnerStashCookie(response: NextResponse) {
  response.cookies.set(OWNER_STASH_COOKIE_NAME, "", {
    ...ownerStashCookieOptions(),
    maxAge: 0,
  });
}

export function restoreOwnerSessionFromStash(
  response: NextResponse,
  adminToken: string,
) {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    adminToken,
    sessionCookieOptions("admin"),
  );
  clearOwnerStashCookie(response);
}

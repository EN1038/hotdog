import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { assertCanCreateStaff } from "@/lib/brand-plan";
import { resolveOwnerPhoneForBrand } from "@/lib/brand-primary-owner";
import { isBrandStorefrontOpen } from "@/lib/brand-plan-shared";
import { isTestBranch } from "@/lib/branch-test";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type SessionPayload,
} from "@/lib/auth";
import { SESSION_MAX_AGE_SEC } from "@/lib/staff-session-limits";

export { resolveOwnerPhoneForBrand } from "@/lib/brand-primary-owner";

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

/**
 * If this phone is a brand primary owner, auto-create Staff rows on sellable
 * branches so /staff/login works without a separate sync step.
 * Owner seats do not count toward package maxStaff.
 * @returns true if at least one brand was provisioned
 */
export async function ensureOwnerStaffForLoginPhone(
  phone: string,
): Promise<boolean> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 9) return false;

  const brandIdSet = new Set<string>();

  const memberBrandIds = await prisma.brandMember.findMany({
    where: {
      admin: {
        isPlatformAdmin: false,
        OR: [{ phone: normalized }, { username: normalized }],
      },
    },
    select: { brandId: true },
  });
  for (const row of memberBrandIds) brandIdSet.add(row.brandId);

  const contactBrands = await prisma.brand.findMany({
    where: { contactPhone: normalized },
    select: { id: true },
  });
  for (const row of contactBrands) brandIdSet.add(row.id);

  if (brandIdSet.size === 0) return false;

  let provisioned = false;
  for (const brandId of brandIdSet) {
    const owner = await resolveOwnerPhoneForBrand(brandId);
    if (!owner || owner.phone !== normalized) continue;

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        status: true,
        trialEndsAt: true,
        nextDueAt: true,
      },
    });
    if (!brand || !isBrandStorefrontOpen(brand)) continue;

    const branches = await prisma.branch.findMany({
      where: { brandId, isHidden: false },
      select: {
        id: true,
        name: true,
        kind: true,
        isTest: true,
      },
      orderBy: { name: "asc" },
    });

    const sellBranches = branches.filter(
      (b) => b.kind !== "WAREHOUSE" && !isTestBranch(b),
    );
    const pool =
      sellBranches.length > 0
        ? sellBranches
        : branches.filter((b) => b.kind !== "WAREHOUSE");

    if (pool.length === 0) continue;

    await ensureOwnerStaffOnBranches({
      brandId,
      phone: owner.phone,
      name: owner.name,
      branchIds: pool.map((b) => b.id),
    });
    provisioned = true;
  }

  return provisioned;
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

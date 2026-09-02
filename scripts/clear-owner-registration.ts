/**
 * Remove owner self-registration brand + admin for a phone.
 * Keeps staff records on other brands untouched.
 *
 * Usage:
 *   npx tsx scripts/clear-owner-registration.ts 0864612036 --dry-run
 *   ALLOW_OWNER_REGISTRATION_CLEAR=1 npx tsx scripts/clear-owner-registration.ts 0864612036
 */
import "dotenv/config";
import { normalizePhone } from "../src/lib/constants";
import { prisma } from "../src/lib/db";
import { hardDeleteBrandWithCleanup } from "../src/lib/brand-hard-delete";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!DRY_RUN && process.env.ALLOW_OWNER_REGISTRATION_CLEAR !== "1") {
    throw new Error(
      "Set ALLOW_OWNER_REGISTRATION_CLEAR=1 to run (or pass --dry-run to preview)",
    );
  }

  const raw = process.argv.find((a) => /^\d/.test(a));
  if (!raw?.trim()) {
    throw new Error(
      "Usage: npx tsx scripts/clear-owner-registration.ts <phone> [--dry-run]",
    );
  }
  const phone = normalizePhone(raw);

  const admin = await prisma.admin.findFirst({
    where: {
      isPlatformAdmin: false,
      OR: [{ phone }, { username: phone }],
    },
    select: {
      id: true,
      username: true,
      phone: true,
      brandMembers: {
        select: {
          role: true,
          brand: {
            select: {
              id: true,
              code: true,
              name: true,
              billingNote: true,
              primaryAdminId: true,
              status: true,
              _count: { select: { branches: true } },
            },
          },
        },
      },
    },
  });

  if (!admin) {
    console.log(JSON.stringify({ phone, result: "no_admin_found" }, null, 2));
    return;
  }

  const ownedBrands = admin.brandMembers
    .filter((m) => m.role === "OWNER")
    .map((m) => m.brand)
    .filter(
      (b) =>
        b.primaryAdminId === admin.id &&
        b.billingNote === "owner_self_register",
    );

  if (ownedBrands.length === 0) {
    throw new Error(
      `Admin ${admin.id} has no owner_self_register brand to clear — aborting`,
    );
  }
  if (ownedBrands.length > 1) {
    throw new Error(
      `Multiple self-register brands found (${ownedBrands.length}) — aborting`,
    );
  }

  const brand = ownedBrands[0]!;
  const staffOnBrand = await prisma.staff.findMany({
    where: { phone, branch: { brandId: brand.id } },
    select: {
      id: true,
      branch: { select: { name: true, code: true } },
    },
  });

  const staffElsewhere = await prisma.staff.findMany({
    where: { phone, branch: { brandId: { not: brand.id } } },
    select: {
      id: true,
      branch: {
        select: {
          name: true,
          brand: { select: { code: true, name: true } },
        },
      },
    },
  });

  const plan = {
    phone,
    admin: { id: admin.id, username: admin.username },
    deleteBrand: {
      id: brand.id,
      code: brand.code,
      name: brand.name,
      branches: brand._count.branches,
    },
    deleteStaffOnBrand: staffOnBrand,
    keepStaffElsewhere: staffElsewhere,
  };

  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
    return;
  }

  await hardDeleteBrandWithCleanup({
    brandId: brand.id,
    deleteOrders: true,
    revokeStaffSessionsForPhone: phone,
  });
  await prisma.admin.delete({ where: { id: admin.id } });
  await prisma.staffAuthSession.deleteMany({ where: { phone } });

  console.log(
    JSON.stringify(
      {
        ok: true,
        cleared: plan,
        note: "Staff on other brands preserved; staff sessions for phone cleared",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

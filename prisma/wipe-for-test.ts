/**
 * Wipe operational data for a clean manual test.
 * Keeps: Admin accounts (passwords), RestaurantType, SiteSettings.
 *
 * Usage (remote/shared DBs require the flag):
 *   $env:ALLOW_DB_WIPE='1'; npx tsx prisma/wipe-for-test.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function assertWipeAllowed() {
  const url = process.env.DATABASE_URL ?? "";
  const allow = process.env.ALLOW_DB_WIPE === "1";
  const looksRemote =
    /ondigitalocean|amazonaws|\.rds\.|railway|supabase|neon\.tech|render\.com/i.test(
      url,
    );
  const isProd = process.env.NODE_ENV === "production";

  if ((isProd || looksRemote) && !allow) {
    console.error(
      [
        "Refusing to wipe: target looks like a shared/remote or production database.",
        "If you really intend to clear data there, set ALLOW_DB_WIPE=1",
        `(DATABASE_URL host hint: ${url.split("@").pop()?.split("/")[0] ?? "unknown"})`,
      ].join("\n"),
    );
    process.exit(1);
  }
}

assertWipeAllowed();

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const before = {
    admins: await prisma.admin.count(),
    restaurantTypes: await prisma.restaurantType.count(),
    brands: await prisma.brand.count(),
    branches: await prisma.branch.count(),
    orders: await prisma.order.count(),
    customers: await prisma.customer.count(),
    logs: await prisma.adminActivityLog.count(),
  };

  console.log("Before wipe:", before);

  // FK-safe order (children first)
  const deleted = {
    orderItems: (await prisma.orderItem.deleteMany()).count,
    orders: (await prisma.order.deleteMany()).count,
    customers: (await prisma.customer.deleteMany()).count,
    activityLogs: (await prisma.adminActivityLog.deleteMany()).count,
    menuItemOptionLinks: (await prisma.branchMenuItemOptionGroup.deleteMany())
      .count,
    options: (await prisma.branchOption.deleteMany()).count,
    optionGroups: (await prisma.branchOptionGroup.deleteMany()).count,
    menuItems: (await prisma.branchMenuItem.deleteMany()).count,
    categories: (await prisma.menuCategory.deleteMany()).count,
    deliveryLocations: (await prisma.deliveryLocation.deleteMany()).count,
    staffRoles: (await prisma.staffRoleAssignment.deleteMany()).count,
    staff: (await prisma.staff.deleteMany()).count,
    shareCodes: (await prisma.branchShareCode.deleteMany()).count,
    branches: (await prisma.branch.deleteMany()).count,
    brandMembers: (await prisma.brandMember.deleteMany()).count,
    brands: (await prisma.brand.deleteMany()).count,
  };

  // Ensure platform settings row exists in a clean default state
  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {
      siteName: "SkillSale",
      siteTitle: "SkillSale - ระบบสั่งอาหารออนไลน์",
      siteDescription: "แพลตฟอร์มจัดการร้านค้าและรับออเดอร์ออนไลน์",
      logoUrl: null,
      faviconUrl: null,
      primaryColor: "#dc2626",
    },
    create: {
      id: "default",
      siteName: "SkillSale",
      siteTitle: "SkillSale - ระบบสั่งอาหารออนไลน์",
      siteDescription: "แพลตฟอร์มจัดการร้านค้าและรับออเดอร์ออนไลน์",
      logoUrl: null,
      faviconUrl: null,
      primaryColor: "#dc2626",
    },
  });

  const after = {
    admins: await prisma.admin.count(),
    restaurantTypes: await prisma.restaurantType.count(),
    brands: await prisma.brand.count(),
    branches: await prisma.branch.count(),
    orders: await prisma.order.count(),
    customers: await prisma.customer.count(),
    logs: await prisma.adminActivityLog.count(),
    siteSettings: await prisma.siteSettings.count(),
  };

  const admins = await prisma.admin.findMany({
    select: {
      username: true,
      isPlatformAdmin: true,
      _count: { select: { brandMembers: true } },
    },
    orderBy: { username: "asc" },
  });

  console.log("Deleted counts:", deleted);
  console.log("After wipe:", after);
  console.log(
    "Kept admins:",
    admins.map((a) => ({
      username: a.username,
      isPlatformAdmin: a.isPlatformAdmin,
      brandLinks: a._count.brandMembers,
    })),
  );
  console.log(
    "Kept restaurant types:",
    after.restaurantTypes,
    "| Site settings reset to default.",
  );
  console.log(
    "Note: Brand admin accounts remain but have no brand membership until you create/link brands again.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

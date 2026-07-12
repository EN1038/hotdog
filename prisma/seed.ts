import { PrismaClient, StaffRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.admin.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash },
  });

  const branch = await prisma.branch.upsert({
    where: { id: "seed-branch-1" },
    update: {},
    create: {
      id: "seed-branch-1",
      name: "สาขาหลัก",
    },
  });

  await prisma.staff.upsert({
    where: { phone: "0811111111" },
    update: { branchId: branch.id, isActive: true },
    create: {
      phone: "0811111111",
      branchId: branch.id,
      roles: { create: [{ role: StaffRole.SELLER }] },
    },
  });

  await prisma.staff.upsert({
    where: { phone: "0822222222" },
    update: { branchId: branch.id, isActive: true },
    create: {
      phone: "0822222222",
      branchId: branch.id,
      roles: { create: [{ role: StaffRole.DELIVERY }] },
    },
  });

  await prisma.branchMenuItem.upsert({
    where: { id: "seed-bm-1" },
    update: {
      branchId: branch.id,
      name: "หมาล่าครบเซ็ต",
      price: 89,
      description: "เส้น + น้ำซุป + topping",
      sortOrder: 1,
      isHidden: false,
    },
    create: {
      id: "seed-bm-1",
      branchId: branch.id,
      name: "หมาล่าครบเซ็ต",
      price: 89,
      description: "เส้น + น้ำซุป + topping",
      sortOrder: 1,
    },
  });
  await prisma.branchMenuItem.upsert({
    where: { id: "seed-bm-2" },
    update: {
      branchId: branch.id,
      name: "เนื้อวัว",
      price: 35,
      sortOrder: 2,
      isHidden: false,
    },
    create: {
      id: "seed-bm-2",
      branchId: branch.id,
      name: "เนื้อวัว",
      price: 35,
      sortOrder: 2,
    },
  });
  await prisma.branchMenuItem.upsert({
    where: { id: "seed-bm-3" },
    update: {
      branchId: branch.id,
      name: "น้ำซุปต้นตำรับ",
      price: 45,
      sortOrder: 3,
      isHidden: false,
    },
    create: {
      id: "seed-bm-3",
      branchId: branch.id,
      name: "น้ำซุปต้นตำรับ",
      price: 45,
      sortOrder: 3,
    },
  });

  await prisma.deliveryLocation.upsert({
    where: { id: "seed-loc-1" },
    update: {},
    create: {
      id: "seed-loc-1",
      branchId: branch.id,
      name: "หอพัก A",
    },
  });

  await prisma.deliveryLocation.upsert({
    where: { id: "seed-loc-2" },
    update: {},
    create: {
      id: "seed-loc-2",
      branchId: branch.id,
      name: "ลานจอดรถ",
    },
  });

  console.log("Seed complete:");
  console.log("- Admin: admin / admin123");
  console.log("- Staff seller: 0811111111");
  console.log("- Staff delivery: 0822222222");
  console.log("- Branch:", branch.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

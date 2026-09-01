/**
 * Upsert staff phone OTP verified status.
 * Usage: npx tsx scripts/verify-staff-phone.ts 064-9496593
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function main() {
  const raw = process.argv[2] ?? "064-9496593";
  const phone = normalizePhone(raw);
  if (phone.length < 9) {
    throw new Error(`เบอร์ไม่ถูกต้อง: ${raw}`);
  }

  const existing = await prisma.staff.findMany({
    where: { phone },
    select: {
      id: true,
      phone: true,
      name: true,
      branchId: true,
      phoneVerifiedAt: true,
      isActive: true,
      branch: { select: { name: true } },
    },
  });

  const now = new Date();

  if (existing.length > 0) {
    const updated = await prisma.staff.updateMany({
      where: { phone },
      data: { phoneVerifiedAt: now },
    });
    await prisma.customer.upsert({
      where: { phone },
      create: { phone, name: null },
      update: {},
    });
    console.log(
      JSON.stringify(
        {
          action: "updated",
          phone,
          count: updated.count,
          before: existing.map((s) => ({
            id: s.id,
            branch: s.branch.name,
            phoneVerifiedAt: s.phoneVerifiedAt,
          })),
          phoneVerifiedAt: now.toISOString(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const branch =
    (await prisma.branch.findFirst({
      where: { isHidden: false, operatingMode: "SKEWER" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    })) ??
    (await prisma.branch.findFirst({
      where: { isHidden: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }));

  if (!branch) {
    throw new Error("ไม่พบสาขาที่ใช้งานได้สำหรับสร้างพนักงาน");
  }

  const created = await prisma.staff.create({
    data: {
      branchId: branch.id,
      phone,
      name: phone,
      isActive: true,
      phoneVerifiedAt: now,
      roles: {
        create: [{ role: "SELLER" }],
      },
    },
    select: {
      id: true,
      phone: true,
      branchId: true,
      phoneVerifiedAt: true,
    },
  });

  await prisma.customer.upsert({
    where: { phone },
    create: { phone, name: null },
    update: {},
  });

  console.log(
    JSON.stringify(
      {
        action: "created",
        phone,
        staff: created,
        branch: branch.name,
        phoneVerifiedAt: now.toISOString(),
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
  .finally(async () => {
    await prisma.$disconnect();
  });

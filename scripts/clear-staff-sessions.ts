/**
 * Clear staff login device slots for a phone (max-3-devices limit).
 * Usage: npx tsx scripts/clear-staff-sessions.ts 0864612036
 */
import "dotenv/config";
import { normalizePhone } from "../src/lib/constants";
import { prisma } from "../src/lib/db";
import { revokeStaffAuthSessionsForPhone } from "../src/lib/staff-auth-session";

async function main() {
  const raw = process.argv[2];
  if (!raw?.trim()) {
    throw new Error("Usage: npx tsx scripts/clear-staff-sessions.ts <phone>");
  }
  const phone = normalizePhone(raw);
  if (phone.length < 9) {
    throw new Error(`เบอร์ไม่ถูกต้อง: ${raw}`);
  }

  const before = await prisma.staffAuthSession.findMany({
    where: { phone },
    select: {
      id: true,
      deviceId: true,
      lastSeenAt: true,
      revokedAt: true,
      expiresAt: true,
      userAgent: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const staff = await prisma.staff.findMany({
    where: { phone },
    select: {
      id: true,
      name: true,
      isActive: true,
      branch: { select: { name: true } },
    },
  });

  await revokeStaffAuthSessionsForPhone(phone);
  const deleted = await prisma.staffAuthSession.deleteMany({ where: { phone } });

  console.log(
    JSON.stringify(
      {
        phone,
        staff,
        sessionsBefore: before.length,
        sessions: before,
        deletedSessions: deleted.count,
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

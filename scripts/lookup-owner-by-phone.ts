/**
 * Preview owner registration data for a phone.
 * Usage: npx tsx scripts/lookup-owner-by-phone.ts 0864612036
 */
import "dotenv/config";
import { normalizePhone } from "../src/lib/constants";
import { prisma } from "../src/lib/db";

async function main() {
  const raw = process.argv[2];
  if (!raw?.trim()) throw new Error("Usage: npx tsx scripts/lookup-owner-by-phone.ts <phone>");
  const phone = normalizePhone(raw);

  const admins = await prisma.admin.findMany({
    where: {
      isPlatformAdmin: false,
      OR: [{ phone }, { username: phone }],
    },
    select: {
      id: true,
      username: true,
      phone: true,
      createdAt: true,
      brandMembers: {
        select: {
          role: true,
          brand: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              billingNote: true,
              contactPhone: true,
              primaryAdminId: true,
              createdAt: true,
              _count: { select: { branches: true, members: true } },
            },
          },
        },
      },
      primaryOfBrands: {
        select: { id: true, code: true, name: true, billingNote: true },
      },
    },
  });

  const staff = await prisma.staff.findMany({
    where: { phone },
    select: {
      id: true,
      name: true,
      isActive: true,
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          brand: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  console.log(JSON.stringify({ phone, admins, staff }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

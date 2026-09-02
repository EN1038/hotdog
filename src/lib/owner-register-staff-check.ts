import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";

export type ExistingStaffBrandSummary = {
  brandId: string;
  brandName: string;
  brandCode: string;
  branches: { branchId: string; branchName: string }[];
};

/** Active staff memberships grouped by brand — for owner self-register warnings. */
export async function findExistingStaffBrandsForPhone(
  rawPhone: string,
): Promise<ExistingStaffBrandSummary[]> {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 9) return [];

  const rows = await prisma.staff.findMany({
    where: { phone, isActive: true },
    select: {
      branchId: true,
      branch: {
        select: {
          id: true,
          name: true,
          brand: {
            select: { id: true, name: true, code: true, status: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const byBrand = new Map<string, ExistingStaffBrandSummary>();
  for (const row of rows) {
    const brand = row.branch?.brand;
    if (!brand || brand.status === "DELETED") continue;
    const entry = byBrand.get(brand.id) ?? {
      brandId: brand.id,
      brandName: brand.name,
      brandCode: brand.code,
      branches: [],
    };
    if (!entry.branches.some((b) => b.branchId === row.branchId)) {
      entry.branches.push({
        branchId: row.branchId,
        branchName: row.branch!.name,
      });
    }
    byBrand.set(brand.id, entry);
  }

  return [...byBrand.values()];
}

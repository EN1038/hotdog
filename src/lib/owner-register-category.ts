import type { BrandPlan, BranchOperatingMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

export type OwnerRegisterCategory = {
  code: string;
  label: string;
  hint: string;
  plan: BrandPlan;
  operatingMode: BranchOperatingMode;
  offersMasterImport: boolean;
};

const ownerRegisterCategorySelect = {
  code: true,
  name: true,
  ownerRegisterHint: true,
  ownerRegisterPlan: true,
  ownerRegisterOperatingMode: true,
  offersMasterImport: true,
} as const;

function toOwnerRegisterCategory(row: {
  code: string;
  name: string;
  ownerRegisterHint: string | null;
  ownerRegisterPlan: BrandPlan;
  ownerRegisterOperatingMode: BranchOperatingMode;
  offersMasterImport: boolean;
}): OwnerRegisterCategory {
  return {
    code: row.code,
    label: row.name,
    hint: row.ownerRegisterHint?.trim() || "",
    plan: row.ownerRegisterPlan,
    operatingMode: row.ownerRegisterOperatingMode,
    offersMasterImport: row.offersMasterImport,
  };
}

/** Active restaurant types shown on /owner/register — managed in admin → ประเภทร้าน. */
export async function listOwnerRegisterCategories(): Promise<
  OwnerRegisterCategory[]
> {
  await ensureProdSchemaCompat();
  const rows = await prisma.restaurantType.findMany({
    where: { isActive: true, showInOwnerRegister: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: ownerRegisterCategorySelect,
  });
  return rows.map(toOwnerRegisterCategory);
}

export async function resolveOwnerRegisterCategory(
  code: string,
): Promise<OwnerRegisterCategory | null> {
  const row = await prisma.restaurantType.findFirst({
    where: {
      code,
      isActive: true,
      showInOwnerRegister: true,
    },
    select: ownerRegisterCategorySelect,
  });
  return row ? toOwnerRegisterCategory(row) : null;
}

export function categoryAllowsMasterImportFrom(
  category: OwnerRegisterCategory,
): boolean {
  return category.offersMasterImport;
}

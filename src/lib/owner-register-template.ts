import { prisma } from "@/lib/db";
import { importBranchCatalog } from "@/lib/branch-import";
import { MALAWAIWAI_SOURCE_BRAND_CODE } from "@/lib/malawaiwai-demo-setup";
import { OWNER_REGISTER_BILLING_NOTE } from "@/lib/owner-register-shared";
import { ensureBranchStockLocation } from "@/lib/stock";

export type RegisterTemplateBranch = {
  id: string;
  name: string;
  code: string | null;
  brandId: string;
  brandCode: string;
  menuItemCount: number;
};

const TEMPLATE_BRAND_CODES = [
  () => process.env.OWNER_REGISTER_TEMPLATE_BRAND_CODE?.trim(),
  () => MALAWAIWAI_SOURCE_BRAND_CODE,
  () => "malawaiwai",
] as const;

const TEMPLATE_BRANCH_CODES = [
  () => process.env.OWNER_REGISTER_TEMPLATE_BRANCH_CODE?.trim(),
  () => "klong6",
  () => "khlong-6-hnahmuban-demo",
  () => "main",
] as const;

async function cloneBrandProducts(
  sourceBrandId: string,
  targetBrandId: string,
): Promise<Map<string, string>> {
  const products = await prisma.brandProduct.findMany({
    where: { brandId: sourceBrandId },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map<string, string>();
  for (const p of products) {
    const created = await prisma.brandProduct.create({
      data: {
        brandId: targetBrandId,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        stockType: p.stockType,
        category: p.category,
        imageUrl: p.imageUrl,
        description: p.description,
        unit: p.unit,
        trackStock: p.trackStock,
        trackLots: p.trackLots,
        lowStockAlert: p.lowStockAlert,
        defaultShelfLifeDays: p.defaultShelfLifeDays,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        isActive: p.isActive,
        equipmentStatus: p.equipmentStatus,
      },
    });
    map.set(p.id, created.id);
  }
  return map;
}

export async function resolveRegisterTemplateBranch(): Promise<RegisterTemplateBranch | null> {
  const envBranchId = process.env.OWNER_REGISTER_MENU_TEMPLATE_BRANCH_ID?.trim();
  if (envBranchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: envBranchId },
      select: {
        id: true,
        name: true,
        code: true,
        brandId: true,
        brand: { select: { code: true } },
        _count: { select: { menuItems: true } },
      },
    });
    if (branch && branch._count.menuItems > 0 && branch.brandId) {
      return {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        brandId: branch.brandId,
        brandCode: branch.brand?.code ?? "",
        menuItemCount: branch._count.menuItems,
      };
    }
  }

  const brandCodes = TEMPLATE_BRAND_CODES.map((fn) => fn()).filter(
    (c): c is string => Boolean(c),
  );

  for (const brandCode of brandCodes) {
    const brand = await prisma.brand.findUnique({
      where: { code: brandCode },
      select: { id: true, code: true },
    });
    if (!brand) continue;

    const branchCodes = TEMPLATE_BRANCH_CODES.map((fn) => fn()).filter(
      (c): c is string => Boolean(c),
    );
    for (const branchCode of branchCodes) {
      const branch = await prisma.branch.findFirst({
        where: {
          brandId: brand.id,
          code: branchCode,
          isHidden: false,
          kind: "STORE",
        },
        select: {
          id: true,
          name: true,
          code: true,
          _count: { select: { menuItems: true } },
        },
      });
      if (branch && branch._count.menuItems > 0) {
        return {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          brandId: brand.id,
          brandCode: brand.code,
          menuItemCount: branch._count.menuItems,
        };
      }
    }

    const richest = await prisma.branch.findFirst({
      where: {
        brandId: brand.id,
        isHidden: false,
        isTest: false,
        kind: "STORE",
      },
      orderBy: { menuItems: { _count: "desc" } },
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { menuItems: true } },
      },
    });
    if (richest && richest._count.menuItems > 0) {
      return {
        id: richest.id,
        name: richest.name,
        code: richest.code,
        brandId: brand.id,
        brandCode: brand.code,
        menuItemCount: richest._count.menuItems,
      };
    }
  }

  return null;
}

export type RegisterTemplateImportResult = {
  sourceBranchName: string;
  sourceBrandCode: string;
  menuItems: number;
  categories: number;
  nonMenuItems: number;
  locations: number;
  brandProducts: number;
};

export async function importRegisterTemplateFromMalawaiwai(input: {
  targetBrandId: string;
  targetBranchId: string;
  targetBranchName: string;
  sourceBranchId?: string;
  /** menu = เฉพาะเมนู · full = + สิ้นเปลือง/อุปกรณ์/ที่เก็บ */
  importLevel?: "menu" | "full";
}): Promise<RegisterTemplateImportResult | null> {
  let resolved: RegisterTemplateBranch | null = null;

  if (input.sourceBranchId) {
    const source = await prisma.branch.findUnique({
      where: { id: input.sourceBranchId },
      select: {
        id: true,
        name: true,
        code: true,
        brandId: true,
        brand: { select: { code: true } },
        _count: { select: { menuItems: true } },
      },
    });
    if (source && source._count.menuItems > 0 && source.brandId) {
      resolved = {
        id: source.id,
        name: source.name,
        code: source.code,
        brandId: source.brandId,
        brandCode: source.brand?.code ?? "",
        menuItemCount: source._count.menuItems,
      };
    }
  }

  if (!resolved) {
    resolved = await resolveRegisterTemplateBranch();
  }
  if (!resolved) return null;

  const brandProductIdMap =
    resolved.brandId === input.targetBrandId
      ? new Map<string, string>()
      : await cloneBrandProducts(resolved.brandId, input.targetBrandId);

  const includeExtras = input.importLevel !== "menu";

  const imported = await importBranchCatalog({
    sourceBranchId: resolved.id,
    targetBranchId: input.targetBranchId,
    overwriteMenu: false,
    includeLocations: includeExtras,
    includeNonMenuItems: includeExtras,
    brandProductIdMap,
    preserveOutOfStock: false,
    preserveNonMenuQuantities: false,
  });

  const branch = await prisma.branch.findUnique({
    where: { id: input.targetBranchId },
    select: { brandId: true, name: true },
  });
  if (branch?.brandId) {
    await ensureBranchStockLocation({
      brandId: branch.brandId,
      branchId: input.targetBranchId,
      branchName: input.targetBranchName || branch.name,
    });
  }

  return {
    sourceBranchName: resolved.name,
    sourceBrandCode: resolved.brandCode,
    menuItems: imported.menuItems,
    categories: imported.categories,
    nonMenuItems:
      imported.nonMenuItems.created + imported.nonMenuItems.updated,
    locations: imported.locations,
    brandProducts: brandProductIdMap.size,
  };
}

export async function syncOwnerRegisterTemplateIfEmpty(
  brandId: string,
): Promise<RegisterTemplateImportResult | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { billingNote: true, status: true },
  });
  if (!brand) return null;
  const isSelfRegister = brand.billingNote === OWNER_REGISTER_BILLING_NOTE;
  if (!isSelfRegister && brand.status !== "TRIAL") return null;

  const branch = await prisma.branch.findFirst({
    where: {
      brandId,
      kind: "STORE",
      isHidden: false,
      isTest: false,
    },
    orderBy: [{ code: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      _count: { select: { menuItems: true } },
    },
  });
  if (!branch || branch._count.menuItems > 0) return null;

  const productCount = await prisma.brandProduct.count({ where: { brandId } });
  if (!isSelfRegister && productCount > 0) return null;

  return importRegisterTemplateFromMalawaiwai({
    targetBrandId: brandId,
    targetBranchId: branch.id,
    targetBranchName: branch.name,
    importLevel: "full",
  });
}

import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashAndSealPassword } from "@/lib/admin-password";
import {
  applyPlanPreset,
  NEW_BRAND_DEFAULTS,
  trialEndsAtFromNow,
} from "@/lib/brand-plan-shared";
import { DEFAULT_BRAND_COLOR } from "@/lib/color";
import {
  importRegisterTemplateFromMalawaiwai,
} from "@/lib/owner-register-template";
import {
  OWNER_REGISTER_TRIAL_DAYS,
  OWNER_REGISTER_BILLING_NOTE,
  OWNER_TRIAL_FULL_MODULES,
  resolveOwnerShopCategory,
  type OwnerRegisterImportLevel,
  type OwnerShopCategoryId,
} from "@/lib/owner-register-shared";
import { slugifyCode, withUniqueSuffix } from "@/lib/slug";
import { ensureWarehouseBranch } from "@/lib/warehouse-branch";

export type OwnerRegisterSetupInput = {
  phone: string;
  shopName: string;
  shopCategory: OwnerShopCategoryId;
  importMaster: OwnerRegisterImportLevel;
};

export type OwnerRegisterSetupResult = {
  brandId: string;
  brandCode: string;
  brandName: string;
  branchId: string;
  adminId: string;
  trialEndsAt: Date;
  importSummary: {
    menuItems: number;
    categories: number;
    nonMenuItems: number;
    locations: number;
  } | null;
};

async function uniqueBrandCode(
  shopName: string,
  tx: PrismaClient = prisma,
): Promise<string> {
  const base = slugifyCode(shopName) || "shop";
  const existing = await tx.brand.findMany({ select: { code: true } });
  const taken = new Set(existing.map((b) => b.code));
  return withUniqueSuffix(base, taken);
}

export { syncOwnerRegisterTemplateIfEmpty } from "@/lib/owner-register-template";

export async function syncOwnerTrialFullAccess(brandId: string): Promise<boolean> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      status: true,
      stockEnabled: true,
      kitchenEnabled: true,
      bbqEnabled: true,
      skewerEnabled: true,
    },
  });
  if (!brand || brand.status !== "TRIAL") return false;

  const needsModuleSync =
    !brand.stockEnabled ||
    !brand.kitchenEnabled ||
    !brand.bbqEnabled ||
    !brand.skewerEnabled;
  if (!needsModuleSync) return false;

  await prisma.$transaction(async (tx) => {
    await tx.brand.update({
      where: { id: brandId },
      data: { ...OWNER_TRIAL_FULL_MODULES },
    });
    if (!brand.stockEnabled) {
      await tx.branch.updateMany({
        where: {
          brandId,
          kind: "STORE",
          isHidden: false,
          isTest: false,
        },
        data: { stockEnabled: true },
      });
    }
  });

  if (!brand.stockEnabled) {
    await ensureWarehouseBranch(brandId);
  }
  return true;
}

export async function createOwnerRegistration(
  input: OwnerRegisterSetupInput,
): Promise<OwnerRegisterSetupResult> {
  const category = resolveOwnerShopCategory(input.shopCategory);
  const preset = applyPlanPreset(category.plan);
  const code = await uniqueBrandCode(input.shopName);
  const randomPassword = randomBytes(18).toString("base64url");
  const { passwordHash, passwordEnc } = await hashAndSealPassword(randomPassword);
  const trialEndsAt = trialEndsAtFromNow(OWNER_REGISTER_TRIAL_DAYS);

  const created = await prisma.$transaction(async (tx) => {
    const brand = await tx.brand.create({
      data: {
        code,
        name: input.shopName.trim(),
        contactPhone: input.phone,
        color: DEFAULT_BRAND_COLOR,
        status: NEW_BRAND_DEFAULTS.status,
        plan: preset.plan,
        maxBranches: Math.max(preset.maxBranches, 2),
        maxStaff: Math.max(preset.maxStaff, 15),
        ...OWNER_TRIAL_FULL_MODULES,
        trialEndsAt,
        billingNote: OWNER_REGISTER_BILLING_NOTE,
      },
    });

    const admin = await tx.admin.create({
      data: {
        username: input.phone,
        phone: input.phone,
        passwordHash,
        passwordEnc,
        isPlatformAdmin: false,
      },
    });

    await tx.brandMember.create({
      data: {
        adminId: admin.id,
        brandId: brand.id,
        role: "OWNER",
      },
    });

    await tx.brand.update({
      where: { id: brand.id },
      data: { primaryAdminId: admin.id },
    });

    const branch = await tx.branch.create({
      data: {
        brandId: brand.id,
        code: "main",
        name: "สาขาหลัก",
        phone: input.phone,
        isOpen: false,
        operatingMode: category.operatingMode,
        stockEnabled: true,
      },
    });

    return { brand, admin, branch };
  });

  await ensureWarehouseBranch(created.brand.id);

  let importSummary: OwnerRegisterSetupResult["importSummary"] = null;

  if (
    input.importMaster !== "none" &&
    category.offersMasterImport
  ) {
    const imported = await importRegisterTemplateFromMalawaiwai({
      targetBrandId: created.brand.id,
      targetBranchId: created.branch.id,
      targetBranchName: created.branch.name,
      importLevel: input.importMaster === "menu" ? "menu" : "full",
    });
    if (imported) {
      importSummary = {
        menuItems: imported.menuItems,
        categories: imported.categories,
        nonMenuItems: imported.nonMenuItems,
        locations: imported.locations,
      };
    }
  }

  return {
    brandId: created.brand.id,
    brandCode: created.brand.code,
    brandName: created.brand.name,
    branchId: created.branch.id,
    adminId: created.admin.id,
    trialEndsAt,
    importSummary,
  };
}

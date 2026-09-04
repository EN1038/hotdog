import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashAndSealPassword } from "@/lib/admin-password";
import {
  applyPlanPresetFromCatalog,
  getDefaultTrialDays,
} from "@/lib/brand-plan-catalog";
import {
  NEW_BRAND_DEFAULTS,
  trialEndsAtFromNow,
} from "@/lib/brand-plan-shared";
import { DEFAULT_BRAND_COLOR } from "@/lib/color";
import {
  importRegisterTemplateFromMalawaiwai,
} from "@/lib/owner-register-template";
import {
  OWNER_REGISTER_BILLING_NOTE,
  type OwnerRegisterImportLevel,
} from "@/lib/owner-register-shared";
import {
  type OwnerRegisterCategory,
} from "@/lib/owner-register-category";
import { slugifyCode, withUniqueSuffix } from "@/lib/slug";
import { syncBrandStockModule } from "@/lib/brand-stock-activation";
import {
  adminHasLiveBrand,
} from "@/lib/owner-register-phone";

export type OwnerRegisterSetupInput = {
  phone: string;
  shopName: string;
  shopCategory: string;
  importMaster: OwnerRegisterImportLevel;
  category: OwnerRegisterCategory;
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

/**
 * Trial self-register brands keep modules from their chosen plan only
 * (not full unlock). Re-aligns if older rows still have full-trial flags.
 */
export async function syncOwnerTrialPlanModules(brandId: string): Promise<boolean> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      status: true,
      plan: true,
      billingNote: true,
      stockEnabled: true,
      kitchenEnabled: true,
      bbqEnabled: true,
      skewerEnabled: true,
    },
  });
  if (
    !brand ||
    brand.status !== "TRIAL" ||
    brand.billingNote !== OWNER_REGISTER_BILLING_NOTE
  ) {
    return false;
  }

  const preset = await applyPlanPresetFromCatalog(brand.plan);
  const needsModuleSync =
    brand.stockEnabled !== preset.stockEnabled ||
    brand.kitchenEnabled !== preset.kitchenEnabled ||
    brand.bbqEnabled !== preset.bbqEnabled ||
    brand.skewerEnabled !== preset.skewerEnabled;
  if (!needsModuleSync) return false;

  await prisma.$transaction(async (tx) => {
    await tx.brand.update({
      where: { id: brandId },
      data: {
        stockEnabled: preset.stockEnabled,
        kitchenEnabled: preset.kitchenEnabled,
        bbqEnabled: preset.bbqEnabled,
        skewerEnabled: preset.skewerEnabled,
      },
    });
    await tx.branch.updateMany({
      where: {
        brandId,
        kind: "STORE",
        isHidden: false,
        isTest: false,
      },
      data: { stockEnabled: preset.stockEnabled },
    });
  });

  if (brand.stockEnabled !== preset.stockEnabled) {
    await syncBrandStockModule(brandId, preset.stockEnabled);
  }
  return true;
}

/** @deprecated use syncOwnerTrialPlanModules */
export const syncOwnerTrialFullAccess = syncOwnerTrialPlanModules;

export async function createOwnerRegistration(
  input: OwnerRegisterSetupInput,
): Promise<OwnerRegisterSetupResult> {
  const category = input.category;
  const preset = await applyPlanPresetFromCatalog(category.plan);
  const code = await uniqueBrandCode(input.shopName);
  const randomPassword = randomBytes(18).toString("base64url");
  const { passwordHash, passwordEnc } = await hashAndSealPassword(randomPassword);
  const trialDays = await getDefaultTrialDays();
  const trialEndsAt = trialEndsAtFromNow(trialDays);

  const created = await prisma.$transaction(async (tx) => {
    const brand = await tx.brand.create({
      data: {
        code,
        name: input.shopName.trim(),
        contactPhone: input.phone,
        color: DEFAULT_BRAND_COLOR,
        status: NEW_BRAND_DEFAULTS.status,
        plan: preset.plan,
        maxBranches: preset.maxBranches,
        maxStaff: preset.maxStaff,
        stockEnabled: preset.stockEnabled,
        kitchenEnabled: preset.kitchenEnabled,
        bbqEnabled: preset.bbqEnabled,
        skewerEnabled: preset.skewerEnabled,
        trialEndsAt,
        billingNote: OWNER_REGISTER_BILLING_NOTE,
        lineNotifyNewOrder: false,
        lineNotifySkewerOrder: false,
        lineNotifyDailySummary: false,
      },
    });

    // Soft-deleted brands leave the Admin row; reuse so the phone can register again.
    const existingAdmin = await tx.admin.findFirst({
      where: {
        isPlatformAdmin: false,
        OR: [{ phone: input.phone }, { username: input.phone }],
      },
      select: {
        id: true,
        brandMembers: {
          select: { brand: { select: { status: true } } },
        },
      },
    });
    if (existingAdmin && adminHasLiveBrand(existingAdmin)) {
      throw new Error("เบอร์นี้สมัครแล้ว — กรุณาเข้าสู่ระบบ");
    }

    const admin = existingAdmin
      ? await tx.admin.update({
          where: { id: existingAdmin.id },
          data: {
            username: input.phone,
            phone: input.phone,
            passwordHash,
            passwordEnc,
          },
        })
      : await tx.admin.create({
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
        primaryCategory: input.shopCategory,
        stockEnabled: preset.stockEnabled,
      },
    });

    return { brand, admin, branch };
  });

  await syncBrandStockModule(created.brand.id, created.brand.stockEnabled);

  let importSummary: OwnerRegisterSetupResult["importSummary"] = null;

  if (
    input.importMaster !== "none" &&
    category.offersMasterImport
  ) {
    const imported = await importRegisterTemplateFromMalawaiwai({
      targetBrandId: created.brand.id,
      targetBranchId: created.branch.id,
      targetBranchName: created.branch.name,
      importLevel: "full",
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

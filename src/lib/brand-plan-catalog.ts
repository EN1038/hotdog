import type { BrandPlan } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BRAND_PLAN_HINTS,
  BRAND_PLAN_LABELS,
  BRAND_PLAN_PRESETS,
  BRAND_PLAN_PRICES,
  BRAND_PLANS_ORDERED,
  NEW_BRAND_DEFAULTS,
  type BrandPlanPreset,
} from "@/lib/brand-plan-shared";

export type BrandPlanConfigRow = {
  plan: BrandPlan;
  label: string;
  hint: string;
  priceBaht: number;
  maxBranches: number;
  maxStaff: number;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  skewerEnabled: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type BrandPlanCatalog = {
  trialDays: number;
  plans: BrandPlanConfigRow[];
};

function fallbackPlanRow(plan: BrandPlan, sortOrder: number): BrandPlanConfigRow {
  const preset = BRAND_PLAN_PRESETS[plan];
  return {
    plan,
    label: BRAND_PLAN_LABELS[plan],
    hint: BRAND_PLAN_HINTS[plan],
    priceBaht: BRAND_PLAN_PRICES[plan],
    maxBranches: preset.maxBranches,
    maxStaff: preset.maxStaff,
    stockEnabled: preset.stockEnabled,
    kitchenEnabled: preset.kitchenEnabled,
    bbqEnabled: preset.bbqEnabled,
    skewerEnabled: preset.skewerEnabled,
    isActive: true,
    sortOrder,
  };
}

const PLAN_SEED_IDS: Record<BrandPlan, string> = {
  RETAIL: "plan_retail",
  WEIGH_TABLE: "plan_weigh_table",
  MALA: "plan_mala",
  MULTI: "plan_multi",
};

export async function ensureBrandPlanConfigs(): Promise<void> {
  for (const [index, plan] of BRAND_PLANS_ORDERED.entries()) {
    const row = fallbackPlanRow(plan, index + 1);
    await prisma.brandPlanConfig.upsert({
      where: { plan },
      update: {},
      create: {
        id: PLAN_SEED_IDS[plan],
        ...row,
      },
    });
  }
}

export async function getBrandPlanCatalog(): Promise<BrandPlanCatalog> {
  try {
    await ensureBrandPlanConfigs();
    const [settings, rows] = await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: "default" } }),
      prisma.brandPlanConfig.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);

    const byPlan = new Map(rows.map((r) => [r.plan, r]));
    const plans = BRAND_PLANS_ORDERED.map((plan, index) => {
      const row = byPlan.get(plan);
      if (!row) return fallbackPlanRow(plan, index + 1);
      return {
        plan: row.plan,
        label: row.label,
        hint: row.hint,
        priceBaht: row.priceBaht,
        maxBranches: row.maxBranches,
        maxStaff: row.maxStaff,
        stockEnabled: row.stockEnabled,
        kitchenEnabled: row.kitchenEnabled,
        bbqEnabled: row.bbqEnabled,
        skewerEnabled: row.skewerEnabled,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      } satisfies BrandPlanConfigRow;
    });

    return {
      trialDays: settings?.defaultTrialDays ?? NEW_BRAND_DEFAULTS.trialDays,
      plans,
    };
  } catch {
    return {
      trialDays: NEW_BRAND_DEFAULTS.trialDays,
      plans: BRAND_PLANS_ORDERED.map((plan, index) =>
        fallbackPlanRow(plan, index + 1),
      ),
    };
  }
}

export async function getDefaultTrialDays(): Promise<number> {
  const catalog = await getBrandPlanCatalog();
  return catalog.trialDays;
}

export async function applyPlanPresetFromCatalog(
  plan: BrandPlan,
): Promise<BrandPlanPreset> {
  const catalog = await getBrandPlanCatalog();
  const row =
    catalog.plans.find((p) => p.plan === plan && p.isActive) ??
    catalog.plans.find((p) => p.plan === plan) ??
    fallbackPlanRow(plan, 1);
  return {
    plan: row.plan,
    maxBranches: row.maxBranches,
    maxStaff: row.maxStaff,
    stockEnabled: row.stockEnabled,
    kitchenEnabled: row.kitchenEnabled,
    bbqEnabled: row.bbqEnabled,
    skewerEnabled: row.skewerEnabled,
  };
}

export async function getBrandPlanConfigRow(
  plan: BrandPlan,
): Promise<BrandPlanConfigRow> {
  const catalog = await getBrandPlanCatalog();
  return (
    catalog.plans.find((p) => p.plan === plan) ??
    fallbackPlanRow(plan, BRAND_PLANS_ORDERED.indexOf(plan) + 1 || 1)
  );
}

export function planLabelsFromCatalog(
  catalog: BrandPlanCatalog,
): Record<BrandPlan, string> {
  const out = { ...BRAND_PLAN_LABELS };
  for (const row of catalog.plans) {
    out[row.plan] = row.label;
  }
  return out;
}

export function planPricesFromCatalog(
  catalog: BrandPlanCatalog,
): Record<BrandPlan, number> {
  const out = { ...BRAND_PLAN_PRICES };
  for (const row of catalog.plans) {
    out[row.plan] = row.priceBaht;
  }
  return out;
}

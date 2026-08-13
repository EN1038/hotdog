import type {
  BrandPlan,
  BrandStatus,
  BranchOperatingMode,
  Prisma,
} from "@prisma/client";

export class BrandInactiveError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "BrandInactiveError";
  }
}

export class BrandLimitError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "BrandLimitError";
  }
}

export const BRAND_STATUS_LABELS: Record<BrandStatus, string> = {
  TRIAL: "ทดลอง",
  ACTIVE: "ใช้งาน",
  PAUSED: "หยุดใช้",
  EXPIRED: "หมดอายุ",
};

export const BRAND_PLAN_LABELS: Record<BrandPlan, string> = {
  RETAIL: "Retail — ขายทั่วไป",
  WEIGH_TABLE: "Weigh & Table — ชั่ง/โต๊ะ",
  MALA: "Mala — หม่าล่า/ปิ้ง/ทอด/ชาบู",
  MULTI: "Multi-mode — หลายรูปแบบ",
};

/** Suggested monthly price (THB) — billing not wired yet */
export const BRAND_PLAN_PRICES: Record<BrandPlan, number> = {
  RETAIL: 159,
  WEIGH_TABLE: 329,
  MALA: 359,
  MULTI: 499,
};

export const BRAND_PLAN_HINTS: Record<BrandPlan, string> = {
  RETAIL: "หน้าร้าน · คิว · รับออเดอร์ · ลูกค้าสั่งออนไลน์",
  WEIGH_TABLE: "ชั่งกิโล · เปิดบิลโต๊ะ · QR สั่งเพิ่ม",
  MALA: "คิวเคาน์เตอร์ · ชั่งกิโลคู่ได้ · เสียบไม้ · ครัวกลาง",
  MULTI: "ทุก Sales Mode · สต็อกรวม · หลายสาขา",
};

export const BRAND_PLANS_ORDERED: BrandPlan[] = [
  "RETAIL",
  "WEIGH_TABLE",
  "MALA",
  "MULTI",
];

export type BrandPlanPreset = {
  plan: BrandPlan;
  maxBranches: number;
  maxStaff: number;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  skewerEnabled: boolean;
};

/** Applied when platform creates a new brand (general retail). */
export const NEW_BRAND_DEFAULTS = {
  status: "TRIAL" as BrandStatus,
  plan: "RETAIL" as BrandPlan,
  maxBranches: 1,
  maxStaff: 5,
  stockEnabled: false,
  kitchenEnabled: false,
  bbqEnabled: false,
  skewerEnabled: false,
  trialDays: 30,
};

export const BRAND_PLAN_PRESETS: Record<BrandPlan, BrandPlanPreset> = {
  RETAIL: {
    plan: "RETAIL",
    maxBranches: 1,
    maxStaff: 5,
    stockEnabled: false,
    kitchenEnabled: false,
    bbqEnabled: false,
    skewerEnabled: false,
  },
  WEIGH_TABLE: {
    plan: "WEIGH_TABLE",
    maxBranches: 2,
    maxStaff: 10,
    stockEnabled: false,
    kitchenEnabled: false,
    bbqEnabled: true,
    skewerEnabled: false,
  },
  MALA: {
    plan: "MALA",
    maxBranches: 2,
    maxStaff: 15,
    stockEnabled: false,
    kitchenEnabled: true,
    bbqEnabled: true,
    skewerEnabled: true,
  },
  MULTI: {
    plan: "MULTI",
    maxBranches: 5,
    maxStaff: 20,
    stockEnabled: true,
    kitchenEnabled: true,
    bbqEnabled: true,
    skewerEnabled: true,
  },
};

export type BrandUsageFields = {
  status: BrandStatus;
  plan: BrandPlan;
  maxBranches: number;
  maxStaff: number;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  skewerEnabled: boolean;
  trialEndsAt: Date | null;
};

export const brandUsageSelect = {
  id: true,
  name: true,
  status: true,
  plan: true,
  maxBranches: true,
  maxStaff: true,
  stockEnabled: true,
  kitchenEnabled: true,
  bbqEnabled: true,
  skewerEnabled: true,
  trialEndsAt: true,
} satisfies Prisma.BrandSelect;

export function trialEndsAtFromNow(days = NEW_BRAND_DEFAULTS.trialDays): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function effectiveBrandStatus(
  brand: Pick<BrandUsageFields, "status" | "trialEndsAt">,
  now = new Date(),
): BrandStatus {
  if (brand.status === "TRIAL" && brand.trialEndsAt && brand.trialEndsAt < now) {
    return "EXPIRED";
  }
  return brand.status;
}

export function brandInactiveMessage(status: BrandStatus): string {
  if (status === "PAUSED") {
    return "แบรนด์นี้ถูกหยุดใช้งานชั่วคราว — ติดต่อผู้ดูแลแพลตฟอร์ม";
  }
  if (status === "EXPIRED") {
    return "หมดช่วงทดลองใช้งานแล้ว — ติดต่อผู้ดูแลแพลตฟอร์มเพื่อเปิดใช้ต่อ";
  }
  return "แบรนด์นี้ยังไม่พร้อมให้บริการ";
}

export function isBrandStorefrontOpen(
  brand: Pick<BrandUsageFields, "status" | "trialEndsAt">,
  now = new Date(),
): boolean {
  const status = effectiveBrandStatus(brand, now);
  return status === "ACTIVE" || status === "TRIAL";
}

export function assertBrandStorefrontOpen(
  brand: Pick<BrandUsageFields, "status" | "trialEndsAt"> | null | undefined,
): void {
  if (!brand) {
    throw new BrandInactiveError("ไม่พบแบรนด์");
  }
  if (!isBrandStorefrontOpen(brand)) {
    throw new BrandInactiveError(
      brandInactiveMessage(effectiveBrandStatus(brand)),
    );
  }
}

export function planIncludesStock(plan: BrandPlan): boolean {
  return plan === "MULTI";
}

export function canBrandAdminEnableStock(plan: BrandPlan): boolean {
  return planIncludesStock(plan);
}

export function allowedOperatingModes(
  brand: Pick<BrandUsageFields, "bbqEnabled" | "skewerEnabled">,
): BranchOperatingMode[] {
  const modes: BranchOperatingMode[] = ["NORMAL"];
  if (brand.skewerEnabled) modes.push("SKEWER");
  if (brand.bbqEnabled) modes.push("BBQ_WEIGH");
  return modes;
}

export function assertOperatingModeAllowed(
  brand: Pick<BrandUsageFields, "bbqEnabled" | "skewerEnabled">,
  mode: BranchOperatingMode,
): void {
  if (mode === "BBQ_WEIGH" && !brand.bbqEnabled) {
    throw new BrandLimitError(
      "แพ็กนี้ยังไม่เปิดโหมดหมูกระทะ/ชั่ง — อัปเกรดแพ็กหรือติดต่อผู้ดูแลแพลตฟอร์ม",
    );
  }
  if (mode === "SKEWER" && !brand.skewerEnabled) {
    throw new BrandLimitError(
      "แพ็กนี้ยังไม่เปิดโหมดเสียบไม้ — อัปเกรดแพ็กหรือติดต่อผู้ดูแลแพลตฟอร์ม",
    );
  }
}

/** Prisma filter: live customer-facing brands only. */
export function publicUsableBrandWhere(
  now = new Date(),
): Prisma.BrandWhereInput {
  return {
    AND: [
      { status: { in: ["ACTIVE", "TRIAL"] } },
      {
        OR: [
          { status: "ACTIVE" },
          { trialEndsAt: null },
          { trialEndsAt: { gt: now } },
        ],
      },
    ],
  };
}

/** Prisma filter: customer storefront branches. */
export function publicCustomerBranchWhere(opts?: {
  brandCode?: string | null;
  branchCode?: string | null;
  query?: string | null;
}): Prisma.BranchWhereInput {
  const brandFilter: Prisma.BrandWhereInput = {
    AND: [
      publicUsableBrandWhere(),
      ...(opts?.brandCode ? [{ code: opts.brandCode }] : []),
    ],
  };
  return {
    isHidden: false,
    isTest: false,
    brand: { is: brandFilter },
    ...(opts?.branchCode ? { code: opts.branchCode } : {}),
    ...(opts?.query
      ? { name: { contains: opts.query, mode: "insensitive" } }
      : {}),
  };
}

export function applyPlanPreset(plan: BrandPlan): BrandPlanPreset {
  return { ...BRAND_PLAN_PRESETS[plan] };
}

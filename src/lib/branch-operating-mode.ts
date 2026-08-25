import { HOTPOT_COUNTER_GROUP } from "@/lib/hotpot-counter-group";

export const BRANCH_OPERATING_MODES = [
  "NORMAL",
  "SKEWER",
  "BBQ_WEIGH",
] as const;

export type BranchOperatingModeId = (typeof BRANCH_OPERATING_MODES)[number];

export type BranchOperatingModeMeta = {
  id: BranchOperatingModeId;
  title: string;
  description: string;
  /** Tailwind-ish accent for selected card */
  selectedClass: string;
  badgeClass: string;
};

export const BRANCH_OPERATING_MODE_META: Record<
  BranchOperatingModeId,
  BranchOperatingModeMeta
> = {
  NORMAL: {
    id: "NORMAL",
    title: HOTPOT_COUNTER_GROUP.modeTitle,
    description: HOTPOT_COUNTER_GROUP.modeDescription,
    selectedClass: "border-slate-900 bg-slate-900 text-white",
    badgeClass: "bg-slate-100 text-slate-800",
  },
  SKEWER: {
    id: "SKEWER",
    title: "เสียบไม้",
    description: "สั่งไม้ขั้นต่ำ 12 · รอแอดมินยืนยัน · ไม่ใช้คิว",
    selectedClass: "border-amber-700 bg-amber-700 text-white",
    badgeClass: "bg-orange-100 text-orange-900",
  },
  BBQ_WEIGH: {
    id: "BBQ_WEIGH",
    title: "ชั่งกิโล / โต๊ะเท่านั้น",
    description:
      "QR โต๊ะ · ชั่งกิโล · เปิด–ปิดบิล — ไม่มีคิวหม่าล่า/คีย์ออเดอร์เคาน์เตอร์",
    selectedClass: "border-rose-800 bg-rose-800 text-white",
    badgeClass: "bg-rose-100 text-rose-900",
  },
};

export function isBranchOperatingMode(
  value: unknown,
): value is BranchOperatingModeId {
  return (
    typeof value === "string" &&
    (BRANCH_OPERATING_MODES as readonly string[]).includes(value)
  );
}

export function branchOperatingModeLabel(
  mode: string | null | undefined,
): string {
  if (isBranchOperatingMode(mode)) {
    return BRANCH_OPERATING_MODE_META[mode].title;
  }
  return BRANCH_OPERATING_MODE_META.NORMAL.title;
}

/** Modes a brand may create — BBQ / เสียบไม้ only when the plan module is on. */
export function allowedOperatingModesForBrand(brand: {
  bbqEnabled?: boolean;
  skewerEnabled?: boolean;
} | null | undefined): BranchOperatingModeId[] {
  const modes: BranchOperatingModeId[] = ["NORMAL"];
  if (brand?.skewerEnabled) modes.push("SKEWER");
  if (brand?.bbqEnabled) modes.push("BBQ_WEIGH");
  return modes;
}

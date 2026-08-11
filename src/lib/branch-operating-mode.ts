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
    title: "หมาล่าปกติ",
    description: "คิวออเดอร์ · กะ · หน้าร้านลูกค้าเดิม",
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
    title: "หมูกระทะชั่งกิโล",
    description: "QR โต๊ะ · ชั่งกิโล · เปิดบิลแล้วปิดท้ายมื้อ",
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

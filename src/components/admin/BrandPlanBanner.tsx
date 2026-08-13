"use client";

import type { BrandPlan } from "@prisma/client";
import {
  BRAND_PLAN_LABELS,
  BRAND_PLAN_PRICES,
} from "@/lib/brand-plan-shared";

export type BrandStatusId = "TRIAL" | "ACTIVE" | "PAUSED" | "EXPIRED";
export type BrandPlanId = BrandPlan;

export const BRAND_STATUS_LABELS: Record<BrandStatusId, string> = {
  TRIAL: "ทดลอง",
  ACTIVE: "ใช้งาน",
  PAUSED: "หยุดใช้",
  EXPIRED: "หมดอายุ",
};

export { BRAND_PLAN_LABELS };

export const BRAND_STATUS_BADGE: Record<BrandStatusId, string> = {
  TRIAL: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-slate-200 text-slate-700",
  EXPIRED: "bg-red-100 text-red-800",
};

export type BrandPlanSummary = {
  status?: BrandStatusId;
  plan?: BrandPlanId;
  maxBranches?: number;
  maxStaff?: number;
  stockEnabled?: boolean;
  kitchenEnabled?: boolean;
  bbqEnabled?: boolean;
  skewerEnabled?: boolean;
  trialEndsAt?: string | Date | null;
  _count?: { branches: number; members?: number };
};

export function effectiveStatus(
  brand: Pick<BrandPlanSummary, "status" | "trialEndsAt">,
): BrandStatusId {
  const status = brand.status ?? "ACTIVE";
  if (status === "TRIAL" && brand.trialEndsAt) {
    const ends = new Date(brand.trialEndsAt);
    if (!Number.isNaN(ends.getTime()) && ends < new Date()) return "EXPIRED";
  }
  return status;
}

export function formatTrialEndsAt(value: string | Date | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function moduleLabels(brand: BrandPlanSummary): string[] {
  return [
    brand.stockEnabled ? "สต็อก" : null,
    brand.kitchenEnabled ? "ครัว" : null,
    brand.bbqEnabled ? "หมูกระทะ" : null,
    brand.skewerEnabled ? "เสียบไม้" : null,
  ].filter((v): v is string => Boolean(v));
}

export function BrandPlanBanner({
  brand,
  editable = false,
  onEdit,
}: {
  brand: BrandPlanSummary;
  editable?: boolean;
  onEdit?: () => void;
}) {
  const status = effectiveStatus(brand);
  const plan = brand.plan ?? "RETAIL";
  const trial = formatTrialEndsAt(brand.trialEndsAt);
  const modules = moduleLabels(brand);
  const branchUsed = brand._count?.branches;
  const maxBranches = brand.maxBranches;
  const maxStaff = brand.maxStaff;
  const price = BRAND_PLAN_PRICES[plan];

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BRAND_STATUS_BADGE[status]}`}
          >
            {BRAND_STATUS_LABELS[status]}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
            {BRAND_PLAN_LABELS[plan]}
          </span>
          <span className="text-[11px] text-slate-500">฿{price}/เดือน</span>
          {status === "TRIAL" && trial ? (
            <span className="text-[11px] text-amber-800">ทดลองถึง {trial}</span>
          ) : null}
          {status === "EXPIRED" ? (
            <span className="text-[11px] text-red-700">
              หมดช่วงทดลองแล้ว — ร้านและพนักงานเข้าใช้ไม่ได้
            </span>
          ) : null}
          {status === "PAUSED" ? (
            <span className="text-[11px] text-slate-600">
              หยุดใช้ชั่วคราว — ร้านและพนักงานเข้าใช้ไม่ได้
            </span>
          ) : null}
        </div>
        <p className="text-sm text-slate-600">
          สาขาสูงสุด {maxBranches ?? "—"}
          {typeof branchUsed === "number" ? ` · ใช้แล้ว ${branchUsed}` : ""}
          {" · "}
          พนักงานสูงสุด {maxStaff ?? "—"}
          {modules.length > 0
            ? ` · โมดูล: ${modules.join(" · ")}`
            : " · โมดูลพิเศษปิดอยู่"}
        </p>
        {!editable ? (
          <p className="text-xs text-slate-500">
            เปลี่ยนแพ็กเกจ / สถานะ / โควต้าได้เฉพาะผู้ดูแลแพลตฟอร์ม
          </p>
        ) : null}
      </div>
      {editable && onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ตั้งแพ็กเกจ
        </button>
      ) : null}
    </div>
  );
}

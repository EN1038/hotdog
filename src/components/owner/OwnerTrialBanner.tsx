"use client";

import Link from "next/link";
import {
  formatDaysRemaining,
  formatTrialEndsAt,
  daysUntilDate,
} from "@/components/admin/BrandPlanBanner";
import type { OwnerSubscriptionInfo } from "@/lib/owner-dashboard";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

export function OwnerTrialBanner({
  subscription,
}: {
  subscription: OwnerSubscriptionInfo | null;
}) {
  if (!subscription) return null;

  const isTrial =
    subscription.effectiveStatus === "TRIAL" ||
    subscription.status === "TRIAL";
  if (!isTrial) return null;

  const trialLabel = formatTrialEndsAt(subscription.trialEndsAt);
  const daysLeft = subscription.daysLeft ?? daysUntilDate(subscription.trialEndsAt);
  const daysText = formatDaysRemaining(daysLeft);
  const urgent = daysLeft != null && daysLeft >= 0 && daysLeft <= 7;

  return (
    <div
      className={`mx-4 mb-3 rounded-2xl border px-4 py-3 ${
        urgent
          ? "border-amber-300 bg-amber-50"
          : "border-emerald-200 bg-emerald-50/90"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-[13px] font-extrabold ${
              urgent ? "text-amber-950" : "text-emerald-950"
            }`}
          >
            {urgent ? "ใกล้หมดช่วงทดลอง" : "ช่วงทดลองใช้ฟรี"}
          </p>
          <p
            className={`mt-0.5 text-[12px] font-semibold ${
              urgent ? "text-amber-900/90" : "text-emerald-900/85"
            }`}
          >
            {daysText ?? "ทดลองใช้"}
            {trialLabel ? ` · ถึง ${trialLabel}` : ""}
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-600">
            ลองครบทุกฟีเจอร์ รวมสต๊อก · ครัว · รายงาน — ต่ออายุเมื่อพร้อม
          </p>
        </div>
        <Link
          href="/owner/settings"
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${
            urgent
              ? "bg-amber-200 text-amber-950"
              : "bg-emerald-700 text-white"
          }`}
        >
          ดูบัญชี
        </Link>
      </div>
      {urgent ? (
        <a
          href={PLATFORM_LINE_ADD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] font-bold text-amber-900 underline"
        >
          ติดต่อทีมงานเพื่อต่ออายุ
        </a>
      ) : null}
    </div>
  );
}

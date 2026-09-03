"use client";

import Link from "next/link";
import { IconGift } from "@/components/icons";
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
      className={`rounded-[1.25rem] border px-4 py-3.5 ${
        urgent
          ? "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white shadow-[0_4px_20px_rgba(245,158,11,0.12)]"
          : "border-site-primary-soft bg-site-primary-banner shadow-site-primary-button"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            urgent
              ? "bg-amber-100 text-amber-700"
              : "bg-site-primary-badge text-site-primary"
          }`}
        >
          <IconGift size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[14px] font-extrabold ${
              urgent ? "text-amber-950" : "text-site-primary"
            }`}
          >
            {urgent ? "ใกล้หมดช่วงทดลอง" : "ช่วงทดลองใช้ฟรี"}
          </p>
          <p
            className={`mt-0.5 text-[13px] font-semibold ${
              urgent ? "text-amber-900/90" : "text-site-primary-medium"
            }`}
          >
            {daysText ?? "ทดลองใช้"}
            {trialLabel ? ` · ถึง ${trialLabel}` : ""}
          </p>
          <p className="mt-1 text-[12px] font-medium leading-snug text-slate-500">
            ลองครบทุกฟีเจอร์ รวมสต๊อก · ครัว · รายงาน — ต่ออายุเมื่อพร้อม
          </p>
        </div>
        <Link
          href="/owner/settings"
          className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-extrabold shadow-sm ${
            urgent
              ? "bg-amber-200 text-amber-950"
              : "bg-site-primary text-white active:bg-site-primary-active"
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
          className="mt-2.5 inline-block pl-14 text-[11px] font-bold text-amber-900 underline"
        >
          ติดต่อทีมงานเพื่อต่ออายุ
        </a>
      ) : null}
    </div>
  );
}

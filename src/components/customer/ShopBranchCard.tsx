"use client";

import Link from "next/link";
import type { BranchData } from "@/lib/customer-types";
import {
  formatTodayHoursSummary,
  getBranchServiceStatus,
} from "@/lib/branch-hours";
import {
  localizedName,
  priceRangeLabel,
  restaurantCategoryLabel,
} from "@/lib/localized";
import { IconBranchPlaceholder } from "@/components/icons";
import { branchDeepLink } from "@/lib/customer-directory";

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.2" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path
        d="M8 11V8a4 4 0 118 0v3"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l4 4 10-10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="5"
        width="16"
        height="15"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ShopBranchCard({
  branch,
  distanceLabel,
}: {
  branch: BranchData;
  distanceLabel?: string | null;
}) {
  const service = getBranchServiceStatus(branch, "PICKUP");
  const displayName = localizedName(branch.name, branch.nameTh, branch.nameEn);
  const categoryBits = [
    restaurantCategoryLabel(branch.primaryCategory),
    ...(branch.secondaryCategories ?? []).map(restaurantCategoryLabel),
  ].filter(Boolean);
  const range = priceRangeLabel(branch.priceRange);
  const modeHint =
    branch.operatingMode === "BBQ_WEIGH"
      ? "สแกน QR ที่โต๊ะ"
      : branch.operatingMode === "SKEWER"
        ? "สั่งเสียบไม้"
        : null;

  return (
    <Link
      href={branchDeepLink(branch)}
      className="flex items-stretch gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition hover:border-site-primary/30 hover:shadow-md active:scale-[0.99]"
    >
      <div className="relative w-[108px] shrink-0 self-stretch overflow-hidden rounded-xl bg-site-primary-soft">
        {branch.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branch.imageUrl}
            alt={displayName}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <IconBranchPlaceholder size={48} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-[15px] font-bold leading-snug text-gray-900">
            {displayName}
          </p>
          {distanceLabel ? (
            <span className="text-[11px] font-semibold text-site-primary">
              {distanceLabel}
            </span>
          ) : null}
        </div>

        {(categoryBits.length > 0 || range || modeHint) && (
          <p className="mt-0.5 text-[11px] text-gray-500">
            {[...categoryBits, range ? `฿${range}` : "", modeHint]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {branch.address ? (
          <div className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-gray-500">
            <PinIcon className="mt-0.5 shrink-0 text-gray-400" />
            <p className="line-clamp-2">{branch.address}</p>
          </div>
        ) : null}

        <div className="mt-2 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {service.openNow ? (
              <>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200">
                  <CheckIcon />
                  ร้านเปิด
                </span>
                <span className="text-[10px] text-gray-500">
                  {formatTodayHoursSummary(service.schedule)}
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <LockIcon />
                  ร้านปิด
                </span>
                <span className="text-[10px] text-gray-500">
                  {formatTodayHoursSummary(service.schedule)}
                </span>
              </>
            )}
          </div>

          {!service.openNow && service.acceptingOrders ? (
            <span className="inline-flex w-fit items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-200">
              <CalendarIcon />
              สั่งล่วงหน้าได้
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

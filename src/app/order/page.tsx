"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import { LoadingState } from "@/components/LoadingState";

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="#9ca3af" strokeWidth="2" />
      <path
        d="M20 20l-3.5-3.5"
        stroke="#9ca3af"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function HotpotIllustration() {
  return (
    <svg
      width="96"
      height="80"
      viewBox="0 0 96 80"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <ellipse cx="48" cy="68" rx="32" ry="7" fill="#fde68a" opacity="0.45" />
      <path
        d="M20 42c0-15 12.5-28 28-28s28 13 28 28v10H20V42z"
        fill="#ef4444"
      />
      <path
        d="M24 52h48v6c0 5-4.5 9-10 9H34c-5.5 0-10-4-10-9v-6z"
        fill="#dc2626"
      />
      <ellipse cx="48" cy="44" rx="22" ry="11" fill="#fbbf24" opacity="0.9" />
      <circle cx="38" cy="40" r="3.5" fill="#f97316" />
      <circle cx="52" cy="38" r="3" fill="#ea580c" />
      <circle cx="44" cy="46" r="2.5" fill="#fb923c" />
      <line
        x1="32"
        y1="20"
        x2="28"
        y2="6"
        stroke="#92400e"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="27" cy="5" r="3.5" fill="#f87171" />
      <line
        x1="48"
        y1="16"
        x2="48"
        y2="2"
        stroke="#92400e"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="48" cy="1.5" r="3.5" fill="#4ade80" />
      <line
        x1="64"
        y1="20"
        x2="70"
        y2="8"
        stroke="#92400e"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="71" cy="7" r="3.5" fill="#fbbf24" />
      <line
        x1="40"
        y1="18"
        x2="36"
        y2="8"
        stroke="#92400e"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="35" cy="7" r="2.5" fill="#fca5a5" />
    </svg>
  );
}

function DeliveryBagIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect x="12" y="20" width="40" height="36" rx="5" fill="#d97706" />
      <path
        d="M20 20c0-7 6-12 12-12s12 5 12 12"
        stroke="#b45309"
        strokeWidth="3.5"
        fill="none"
      />
      <rect x="24" y="32" width="16" height="12" rx="2.5" fill="#fbbf24" />
      <circle cx="48" cy="16" r="12" fill="#fff7ed" stroke="#fb923c" strokeWidth="1.8" />
      <circle cx="48" cy="16" r="8" stroke="#f97316" strokeWidth="1.8" fill="none" />
      <path
        d="M48 11v5l3 2"
        stroke="#f97316"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M54 10l2-2M58 14l2 1"
        stroke="#fbbf24"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function sortBranches(branches: BranchData[]): BranchData[] {
  return [...branches].sort((a, b) => {
    const aOpen = getBranchServiceStatus(a, "PICKUP").openNow;
    const bOpen = getBranchServiceStatus(b, "PICKUP").openNow;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return a.name.localeCompare(b.name, "th");
  });
}

function BranchCard({ branch }: { branch: BranchData }) {
  const service = getBranchServiceStatus(branch, "PICKUP");
  const displayName = localizedName(branch.name, branch.nameTh, branch.nameEn);
  const categoryBits = [
    restaurantCategoryLabel(branch.primaryCategory),
    ...(branch.secondaryCategories ?? []).map(restaurantCategoryLabel),
  ].filter(Boolean);
  const range = priceRangeLabel(branch.priceRange);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      {branch.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branch.imageUrl}
          alt={displayName}
          className="h-[84px] w-[84px] shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-100 to-orange-50">
          <IconBranchPlaceholder size={48} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold leading-snug text-gray-900">
          {displayName}
        </p>

        {(categoryBits.length > 0 || range) && (
          <p className="mt-0.5 text-[11px] text-gray-500">
            {[...categoryBits, range ? `฿${range}` : ""].filter(Boolean).join(" · ")}
          </p>
        )}

        {branch.address && (
          <div className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-gray-500">
            <PinIcon className="mt-0.5 shrink-0 text-gray-400" />
            <p className="line-clamp-2">{branch.address}</p>
          </div>
        )}

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

          {!service.openNow && service.acceptingOrders && (
            <span className="inline-flex w-fit items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-200">
              <CalendarIcon />
              สั่งล่วงหน้าได้
            </span>
          )}
        </div>
      </div>

      <Link
        href={`/order/store/${branch.id}`}
        className="shrink-0 self-center rounded-xl border border-orange-400 bg-white px-3.5 py-2 text-xs font-semibold text-orange-500 transition-colors hover:bg-orange-50"
      >
        เลือกสาขา
      </Link>
    </div>
  );
}

export default function BranchListPage() {
  const { siteName } = useSiteBranding();
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customer/branches")
      .then((res) => res.json())
      .then((data) => setBranches(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? branches.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            (b.address?.toLowerCase().includes(q) ?? false),
        )
      : branches;
    return sortBranches(list);
  }, [branches, query]);

  return (
    <main className="min-h-screen bg-[#f5f5f6] pb-10">
      <header className="relative overflow-hidden bg-white px-4 pb-5 pt-4">
        <div className="flex items-start gap-1">
          <Link
            href="/malawaiwai"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
            aria-label="กลับ"
          >
            <BackIcon />
          </Link>

          <div className="min-w-0 flex-1 pr-20 pt-0.5">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-gray-900">
              เลือกร้าน{siteName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              เลือกสาขาที่ต้องการสั่ง
            </p>
          </div>

          <div className="pointer-events-none absolute -right-1 top-2">
            <HotpotIllustration />
          </div>
        </div>
      </header>

      <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-[#fff4eb] px-4 py-3.5">
        <div className="text-orange-500">
          <ClockIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-orange-600">
            ยังไม่ถึงเวลาเปิด — สั่งล่วงหน้าได้เฉพาะวันนี้
          </p>
          <p className="mt-0.5 text-xs text-orange-500/80">
            หลังร้านปิดรอบสุดท้ายของวันแล้วจะสั่งไม่ได้
          </p>
        </div>
        <DeliveryBagIllustration />
      </div>

      <div className="mx-4 mt-3 flex gap-2">
        <button
          type="button"
          className="flex max-w-[46%] shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700"
        >
          <PinIcon className="text-orange-500" />
          <span className="truncate">ใช้ตำแหน่งปัจจุบัน</span>
          <ChevronDownIcon />
        </button>

        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-4 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
            placeholder="ค้นหาสาขาใกล้คุณ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <h2 className="mx-4 mt-5 mb-3 text-[15px] font-bold text-gray-900">
        สาขาทั้งหมด
      </h2>

      {loading ? (
        <LoadingState className="mt-8 border-0 bg-transparent shadow-none" />
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">
          ไม่พบสาขาที่ค้นหา
        </p>
      ) : (
        <div className="space-y-3 px-4">
          {filtered.map((b) => (
            <BranchCard key={b.id} branch={b} />
          ))}
        </div>
      )}

      <div className="mt-8 flex justify-center px-4">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <PinIcon className="text-orange-400" />
          <span>
            ไม่พบสาขาที่ต้องการ?{" "}
            <span className="font-medium text-orange-500">
              แจ้งให้เราทราบ &gt;
            </span>
          </span>
        </button>
      </div>
    </main>
  );
}

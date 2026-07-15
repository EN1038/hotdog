"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  distanceKm,
  formatDistanceKm,
  hasMapPin,
} from "@/lib/geo";
import { IconBranchPlaceholder } from "@/components/icons";
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import { SiteLogo } from "@/components/customer/SiteLogo";
import { LoadingState } from "@/components/LoadingState";
import { loadActiveBrand } from "@/lib/customer-brand-session";
import { telHref } from "@/lib/constants";

type UserLocation = { lat: number; lng: number };

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

function branchDistanceKm(
  branch: BranchData,
  user: UserLocation | null,
): number | null {
  if (!user || !hasMapPin(branch)) return null;
  return distanceKm(user.lat, user.lng, branch.latitude, branch.longitude);
}

function sortBranches(
  branches: BranchData[],
  user: UserLocation | null,
): BranchData[] {
  return [...branches].sort((a, b) => {
    if (user) {
      const da = branchDistanceKm(a, user);
      const db = branchDistanceKm(b, user);
      if (da != null && db != null && da !== db) return da - db;
      if (da != null && db == null) return -1;
      if (da == null && db != null) return 1;
    }
    const aOpen = getBranchServiceStatus(a, "PICKUP").openNow;
    const bOpen = getBranchServiceStatus(b, "PICKUP").openNow;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return a.name.localeCompare(b.name, "th");
  });
}

function matchesQuery(branch: BranchData, q: string): boolean {
  if (!q) return true;
  const hay = [
    branch.name,
    branch.nameTh,
    branch.nameEn,
    branch.code,
    branch.address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function BranchCard({
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
  return (
    <Link
      href={`/order/store/${branch.id}`}
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
    </Link>
  );
}

export default function BranchListPage() {
  const branding = useSiteBranding();
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [brandBackHref, setBrandBackHref] = useState("/");
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = loadActiveBrand();
    if (active?.code) setBrandBackHref(`/${active.code}`);
    setContactPhone(active?.contactPhone ?? null);

    const url = active?.code
      ? `/api/customer/branches?brand=${encodeURIComponent(active.code)}`
      : "/api/customer/branches";

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setBranches(list);
        const brandPhone = list[0]?.brand?.contactPhone?.replace(/\D/g, "");
        if (brandPhone) {
          setContactPhone(brandPhone);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  function requestCurrentLocation() {
    setMenuOpen(false);
    setLocationError(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError(
            "ไม่ได้รับอนุญาตใช้ตำแหน่ง — เปิดสิทธิ์ในเบราว์เซอร์แล้วลองใหม่",
          );
        } else if (err.code === err.TIMEOUT) {
          setLocationError("ขอตำแหน่งนานเกินไป กรุณาลองใหม่");
        } else {
          setLocationError("อ่านตำแหน่งไม่ได้ กรุณาลองใหม่");
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 },
    );
  }

  function clearLocation() {
    setMenuOpen(false);
    setUserLocation(null);
    setLocationError(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = branches.filter((b) => matchesQuery(b, q));
    return sortBranches(list, userLocation);
  }, [branches, query, userLocation]);

  const locationLabel = locating
    ? "กำลังหาตำแหน่ง..."
    : userLocation
      ? "เรียงใกล้คุณ"
      : "ใช้ตำแหน่งปัจจุบัน";

  return (
    <main className="min-h-screen bg-[#f5f5f6] pb-10">
      <header className="bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href={brandBackHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
              aria-label="กลับ"
            >
              <BackIcon />
            </Link>
            <h1 className="truncate text-[22px] font-bold tracking-tight text-gray-900">
              เลือกร้าน
            </h1>
          </div>
          <SiteLogo
            logoUrl={branding.isBrandOverride ? branding.logoUrl : null}
            size={52}
            platformPlacement="order"
          />
        </div>
      </header>

      <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-site-primary-soft px-4 py-3.5">
        <div className="text-site-primary">
          <ClockIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-site-primary">
            ยังไม่ถึงเวลาเปิด — สั่งล่วงหน้าได้เฉพาะวันนี้
          </p>
          <p className="mt-0.5 text-xs opacity-80 text-site-primary">
            หลังร้านปิดรอบสุดท้ายของวันแล้วจะสั่งไม่ได้
          </p>
        </div>
      </div>

      <div className="mx-4 mt-3 flex items-stretch gap-2">
        <div className="relative w-[42%] shrink-0" ref={menuRef}>
          <button
            type="button"
            disabled={locating}
            onClick={() => {
              if (userLocation) {
                setMenuOpen((v) => !v);
                return;
              }
              requestCurrentLocation();
            }}
            className={`flex h-11 w-full items-center gap-1.5 rounded-xl border px-3 text-xs leading-none disabled:opacity-60 ${
              userLocation
                ? "border-site-primary bg-site-primary-soft font-medium text-site-primary"
                : "border-gray-200 bg-white text-gray-700"
            }`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <PinIcon className="shrink-0 text-site-primary" />
            <span className="min-w-0 flex-1 truncate text-left">
              {locationLabel}
            </span>
            <ChevronDownIcon />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2.5 text-left text-xs text-gray-800 hover:bg-gray-50"
                onClick={requestCurrentLocation}
              >
                ใช้ตำแหน่งปัจจุบัน
              </button>
              {userLocation ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2.5 text-left text-xs text-gray-800 hover:bg-gray-50"
                  onClick={clearLocation}
                >
                  ล้างตำแหน่ง
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            className="box-border h-11 w-full rounded-xl border border-gray-200 bg-white py-0 pr-3 pl-9 text-xs leading-none text-gray-900 placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
            placeholder="ค้นหาชื่อสาขาหรือที่อยู่"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {locationError ? (
        <p className="mx-4 mt-2 text-xs text-red-600">{locationError}</p>
      ) : null}

      <h2 className="mx-4 mt-5 mb-3 text-[15px] font-bold text-gray-900">
        {userLocation ? "สาขาใกล้คุณ" : "สาขาทั้งหมด"}
      </h2>

      {loading ? (
        <LoadingState className="mt-8 border-0 bg-transparent shadow-none" />
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">
          ไม่พบสาขาที่ค้นหา
        </p>
      ) : (
        <div className="space-y-3 px-4">
          {filtered.map((b) => {
            const km = branchDistanceKm(b, userLocation);
            return (
              <BranchCard
                key={b.id}
                branch={b}
                distanceLabel={km != null ? formatDistanceKm(km) : null}
              />
            );
          })}
        </div>
      )}

      <div className="mt-8 flex justify-center px-4">
        {contactPhone ? (
          <a
            href={telHref(contactPhone)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <PinIcon className="text-site-primary" />
            <span>
              ไม่พบสาขาที่ต้องการ?{" "}
              <span className="font-medium text-site-primary">
                แจ้งให้เราทราบ &gt;
              </span>
            </span>
          </a>
        ) : (
          <p className="inline-flex items-center gap-1 text-sm text-gray-400">
            <PinIcon className="text-gray-300" />
            <span>ไม่พบสาขาที่ต้องการ? ติดต่อร้านผ่านช่องทางที่คุณรู้จัก</span>
          </p>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BranchData } from "@/lib/customer-types";
import {
  formatBranchDistance,
  groupBranchesByBrand,
  matchesDirectoryQuery,
  sortBranches,
  type UserLocation,
} from "@/lib/customer-directory";
import { ShopBranchCard } from "@/components/customer/ShopBranchCard";
import { ShopBrandHeader } from "@/components/customer/ShopBrandHeader";
import { LoadingState } from "@/components/LoadingState";
import { telHref } from "@/lib/constants";

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

type ShopDirectoryProps = {
  /** Restrict to one brand (brand hub). Omit for platform-wide /shops */
  brandCode?: string;
  backHref?: string;
  title?: string;
  showBrandHeaders?: boolean;
};

export function ShopDirectory({
  brandCode,
  backHref = "/",
  title = "เลือกร้าน",
  showBrandHeaders = true,
}: ShopDirectoryProps) {
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams({ lite: "1" });
    if (brandCode) params.set("brand", brandCode);

    fetch(`/api/customer/branches?${params}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? (data as BranchData[]) : [];
        setBranches(list);
        const brandPhone = list[0]?.brand?.contactPhone?.replace(/\D/g, "");
        if (brandPhone) setContactPhone(brandPhone);
      })
      .finally(() => setLoading(false));
  }, [brandCode]);

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
    return branches.filter((b) => matchesDirectoryQuery(b, q));
  }, [branches, query]);

  const groups = useMemo(
    () => groupBranchesByBrand(filtered, userLocation),
    [filtered, userLocation],
  );

  const flatSorted = useMemo(
    () => sortBranches(filtered, userLocation),
    [filtered, userLocation],
  );

  const locationLabel = locating
    ? "กำลังหาตำแหน่ง..."
    : userLocation
      ? "เรียงใกล้คุณ"
      : "ใช้ตำแหน่งปัจจุบัน";

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-[#f5f5f6] pb-10">
      <header className="bg-white px-4 py-4">
        <div className="flex items-center gap-1">
          <Link
            href={backHref}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
            aria-label="กลับ"
          >
            <BackIcon />
          </Link>
          <h1 className="truncate text-[22px] font-bold tracking-tight text-gray-900">
            {title}
          </h1>
        </div>
      </header>

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

          {menuOpen ? (
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
          ) : null}
        </div>

        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            className="box-border h-11 w-full rounded-xl border border-gray-200 bg-white py-0 pr-3 pl-9 text-xs leading-none text-gray-900 placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
            placeholder={
              showBrandHeaders
                ? "ค้นหาแบรนด์ สาขา หรือที่อยู่"
                : "ค้นหาชื่อสาขาหรือที่อยู่"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {locationError ? (
        <p className="mx-4 mt-2 text-xs text-red-600">{locationError}</p>
      ) : null}

      <h2 className="mx-4 mt-5 mb-3 text-[15px] font-bold text-gray-900">
        {userLocation
          ? showBrandHeaders
            ? "ร้านใกล้คุณ"
            : "สาขาใกล้คุณ"
          : showBrandHeaders
            ? "ร้านทั้งหมด"
            : "สาขาทั้งหมด"}
      </h2>

      {loading ? (
        <LoadingState className="mt-8 border-0 bg-transparent shadow-none" />
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">
          ไม่พบร้านที่ค้นหา
        </p>
      ) : showBrandHeaders ? (
        <div className="space-y-6 px-4">
          {groups.map((group) => (
            <section key={group.brandCode} className="space-y-2.5">
              <ShopBrandHeader
                brandCode={group.brandCode}
                brandName={group.brandName}
                logoUrl={group.logoUrl}
                branchCount={group.branches.length}
              />
              <div className="space-y-3">
                {group.branches.map((b) => (
                  <ShopBranchCard
                    key={b.id}
                    branch={b}
                    distanceLabel={formatBranchDistance(b, userLocation)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3 px-4">
          {flatSorted.map((b) => (
            <ShopBranchCard
              key={b.id}
              branch={b}
              distanceLabel={formatBranchDistance(b, userLocation)}
            />
          ))}
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

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BranchData } from "@/lib/customer-types";
import {
  branchDeepLink,
  formatBranchDistance,
  matchesDirectoryQuery,
  sortBranches,
  type UserLocation,
} from "@/lib/customer-directory";
import { ShopBranchCard } from "@/components/customer/ShopBranchCard";
import { LoadingState } from "@/components/LoadingState";
import { brandColorFromApi } from "@/lib/color";
import { localizedName } from "@/lib/localized";
import { notifyActiveBrandUpdated } from "@/components/customer/OrderBrandingShell";
import { saveActiveBrand } from "@/lib/customer-brand-session";

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

export function BrandHubPage({ brandCode }: { brandCode: string }) {
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      lite: "1",
      brand: brandCode,
    });
    fetch(`/api/customer/branches?${params}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? (data as BranchData[]) : [];
        if (list.length === 0) {
          setNotFound(true);
          return;
        }
        setBranches(list);
        const brand = list[0]?.brand;
        if (brand?.code) {
          const brandName = localizedName(
            brand.name,
            brand.nameTh,
            brand.nameEn,
          );
          saveActiveBrand({
            code: brand.code,
            name: brandName,
            logoUrl: brand.logoUrl?.trim() || null,
            coverImageUrl: brand.coverImageUrl?.trim() || null,
            primaryColor: brandColorFromApi(brand.color),
            contactPhone: brand.contactPhone?.replace(/\D/g, "") || null,
          });
          notifyActiveBrandUpdated();
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [brandCode]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  const brand = branches[0]?.brand ?? null;
  const brandName = brand
    ? localizedName(brand.name, brand.nameTh, brand.nameEn)
    : brandCode;
  const coverUrl = brand?.coverImageUrl?.trim() || null;
  const logoUrl = brand?.logoUrl?.trim() || null;
  const primary = brandColorFromApi(brand?.color);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortBranches(
      branches.filter((b) => matchesDirectoryQuery(b, q)),
      userLocation,
    );
  }, [branches, query, userLocation]);

  const singleOrderable = useMemo(() => {
    if (branches.length !== 1) return null;
    const only = branches[0]!;
    if (only.operatingMode === "BBQ_WEIGH") return null;
    return only;
  }, [branches]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-[#f5f5f6] px-4">
        <LoadingState className="w-full border-0 bg-transparent shadow-none" />
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 bg-[#f5f5f6] p-6">
        <p className="text-center text-gray-500">ไม่พบแบรนด์นี้</p>
        <Link href="/shops" className="text-sm font-semibold text-site-primary">
          กลับไปเลือกร้าน
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-[#f5f5f6] pb-10">
      <div className="relative overflow-hidden bg-[#0b2a4a] text-white">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(160deg, ${primary} 0%, #0b2a4a 75%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/20" />

        <div className="relative px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href="/shops"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm"
            aria-label="กลับไปเลือกร้าน"
          >
            <BackIcon />
          </Link>

          <div className="mt-8 flex items-end gap-3">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg ring-2 ring-white/40">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="text-2xl font-extrabold"
                  style={{ color: primary }}
                >
                  {brandName.slice(0, 1)}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-[24px] font-extrabold tracking-tight drop-shadow">
                {brandName}
              </h1>
              <p className="mt-0.5 text-[13px] text-white/85">
                {branches.length} สาขา · เลือกสาขาเพื่อสั่งอาหาร
              </p>
            </div>
          </div>
        </div>
      </div>

      {singleOrderable ? (
        <div className="px-4 pt-4">
          <Link
            href={branchDeepLink(singleOrderable)}
            className="flex min-h-[3.25rem] w-full items-center justify-center rounded-2xl bg-site-primary text-[16px] font-bold text-white shadow-sm active:brightness-95"
          >
            เข้าสั่งอาหาร
          </Link>
        </div>
      ) : null}

      <div className="mx-4 mt-4">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            className="box-border h-11 w-full rounded-xl border border-gray-200 bg-white py-0 pr-3 pl-9 text-xs leading-none text-gray-900 placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
            placeholder="ค้นหาสาขาหรือที่อยู่"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <h2 className="mx-4 mt-5 mb-3 text-[15px] font-bold text-gray-900">
        สาขาทั้งหมด
      </h2>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-gray-400">ไม่พบสาขา</p>
      ) : (
        <div className="space-y-3 px-4">
          {filtered.map((b) => (
            <ShopBranchCard
              key={b.id}
              branch={b}
              distanceLabel={formatBranchDistance(b, userLocation)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

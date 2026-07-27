"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import {
  IconHome,
  IconLogout,
  IconPackage,
  IconReceipt,
  IconStore,
} from "@/components/icons";

export type StaffShellTab = "home" | "key" | "orders" | "stock" | "settings";

type BrandingPayload = {
  branchName?: string;
  brand?: {
    name?: string | null;
    nameTh?: string | null;
    logoUrl?: string | null;
    coverImageUrl?: string | null;
    color?: string | null;
  };
  isOpen?: boolean;
  stockEnabled?: boolean;
  brandStockEnabled?: boolean;
  pendingOrderCount?: number;
  pendingStockCount?: number;
  canSell?: boolean;
  activeShift?: { roundNumber?: number } | null;
};

function IconKeyOrder({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 7V5a4 4 0 018 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBasket({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 9h18l-1.5 11H4.5L3 9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 9V7a4 4 0 018 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGear({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StaffAppShell({
  children,
  active,
  showHeader = true,
}: {
  children: ReactNode;
  active: StaffShellTab;
  showHeader?: boolean;
}) {
  const pathname = usePathname();
  const branding = useSiteBranding();
  const [meta, setMeta] = useState<BrandingPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BrandingPayload | null) => {
        if (!cancelled && data) setMeta(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const brandName =
    meta?.brand?.nameTh ||
    meta?.brand?.name ||
    branding.siteName ||
    "SkillSale";
  const branchName = meta?.branchName || "";
  const logoUrl = meta?.brand?.logoUrl || branding.logoUrl;
  const coverUrl = meta?.brand?.coverImageUrl || null;
  const accent = meta?.brand?.color || branding.primaryColor || "#ea580c";
  const stockOn = Boolean(
    meta?.stockEnabled && meta?.brandStockEnabled,
  );
  const pendingOrders = meta?.pendingOrderCount ?? 0;
  const pendingStock = meta?.pendingStockCount ?? 0;
  const isOpen = meta?.isOpen ?? false;
  const canSell = meta?.canSell ?? false;

  const tabs: {
    id: StaffShellTab;
    href: string;
    label: string;
    icon: ReactNode;
    badge?: number;
    center?: boolean;
    hide?: boolean;
  }[] = (
    [
      {
        id: "home" as const,
        href: "/staff",
        label: "หน้าหลัก",
        icon: <IconHome size={22} />,
      },
      {
        id: "key" as const,
        href: "/staff/key-order/regular",
        label: "คีย์ออเดอร์",
        icon: <IconKeyOrder size={22} />,
      },
      {
        id: "orders" as const,
        href: "/staff/orders",
        label: "รับออเดอร์",
        icon: <IconBasket size={26} />,
        badge: pendingOrders,
        center: true,
      },
      {
        id: "stock" as const,
        href: "/staff/stock",
        label: "สต๊อก",
        icon: <IconPackage size={22} />,
        badge: pendingStock,
        hide: !stockOn,
      },
      {
        id: "settings" as const,
        href: "/staff/settings",
        label: "ตั้งค่า",
        icon: <IconGear size={22} />,
      },
    ] as const
  ).filter((t) => !("hide" in t && t.hide)) as {
    id: StaffShellTab;
    href: string;
    label: string;
    icon: ReactNode;
    badge?: number;
    center?: boolean;
    hide?: boolean;
  }[];

  // If stock hidden, keep 4 tabs balanced; if we need 5th use receipt for summary via settings only

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-[4.75rem]">
      {showHeader ? (
        <header className="relative overflow-hidden bg-[#1e1e1e] text-white shadow-md">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : null}
          {/* Overlay gradient to keep text readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/85 backdrop-blur-[2px]" />

          <div className="relative z-10 mx-auto max-w-lg px-4 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3.5">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/40 shadow-md">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/90">
                    <IconStore size={26} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-extrabold leading-tight drop-shadow-sm">
                  {brandName}
                </p>
                <p className="mt-1 truncate text-xs font-medium text-white/90 drop-shadow-sm">
                  {branchName ? `สาขา ${branchName.replace(/^สาขา\s*/, "")}` : "—"}
                </p>
              </div>
              <Link
                href="/staff/orders"
                className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white shadow-sm transition hover:bg-white/30"
                aria-label="การแจ้งเตือนออเดอร์"
              >
                <IconReceipt size={22} />
                {pendingOrders > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold shadow">
                    {pendingOrders > 99 ? "99+" : pendingOrders}
                  </span>
                ) : null}
              </Link>
            </div>

            <div className="mt-3.5">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/95 px-3.5 py-2 text-slate-800 shadow-sm backdrop-blur-sm">
                <p className="text-xs font-semibold">
                  <span
                    className={
                      isOpen && canSell ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"
                    }
                  >
                    {isOpen && canSell
                      ? "● เปิดรับออเดอร์"
                      : isOpen
                        ? "● เปิดร้าน — ยังไม่เปิดรอบ"
                        : "● ปิดร้านชั่วคราว"}
                  </span>
                </p>
                <Link
                  href="/staff/settings"
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  จัดการ
                </Link>
              </div>
            </div>
          </div>
        </header>
      ) : null}

      <div className="mx-auto max-w-lg">{children}</div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
        aria-label="เมนูหลักพนักงาน"
      >
        <div className="mx-auto flex max-w-lg items-end justify-between px-1 pt-1">
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            if (tab.center) {
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className="relative -mt-5 flex w-[4.5rem] flex-col items-center"
                >
                  <span
                    className="relative flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-white text-white shadow-lg"
                    style={{ backgroundColor: accent }}
                  >
                    {tab.icon}
                    {(tab.badge ?? 0) > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold">
                        {tab.badge! > 99 ? "99+" : tab.badge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`mt-1 text-[10px] font-semibold ${
                      isActive ? "text-slate-900" : "text-slate-500"
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 ${
                  isActive ? "text-orange-600" : "text-slate-500"
                }`}
                style={isActive ? { color: accent } : undefined}
              >
                <span className="relative">
                  {tab.icon}
                  {(tab.badge ?? 0) > 0 ? (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                      {tab.badge! > 99 ? "99+" : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-[10px] font-semibold">
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function StaffHomeMenuIcon({
  href,
  onClick,
  label,
  badge,
  color,
  children,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  badge?: number;
  color: string;
  children: ReactNode;
}) {
  const content = (
    <>
      <span
        className="relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95"
        style={{ backgroundColor: color }}
      >
        {children}
        {(badge ?? 0) > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
            {badge! > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="max-w-[4.8rem] text-center text-[11px] font-semibold leading-tight text-slate-700">
        {label}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-center gap-2"
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href || "#"} className="flex flex-col items-center gap-2">
      {content}
    </Link>
  );
}

export { IconLogout, IconKeyOrder, IconBasket, IconGear };

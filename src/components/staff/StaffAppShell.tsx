"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import { logout } from "@/components/LoginForm";
import {
  IconHome,
  IconLogout,
  IconReceipt,
  IconStore,
} from "@/components/icons";
import { StaffOrderModeProvider } from "@/components/staff/StaffOrderModeContext";
import { formatPrice } from "@/lib/constants";

export type StaffShellTab = "home" | "key" | "orders" | "summary" | "stock" | "shift-stock" | "settings";

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
  canToggleStore?: boolean;
  stockEnabled?: boolean;
  brandStockEnabled?: boolean;
  pendingOrderCount?: number;
  pendingStockCount?: number;
  canSell?: boolean;
  todayRevenueBaht?: number;
  todayOrderCount?: number;
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
  return (
    <StaffOrderModeProvider>
      <StaffAppShellInner active={active} showHeader={showHeader}>
        {children}
      </StaffAppShellInner>
    </StaffOrderModeProvider>
  );
}

function StaffAppShellInner({
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

  const reloadMeta = () => {
    fetch("/api/staff/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BrandingPayload | null) => {
        if (data) setMeta(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    reloadMeta();
  }, [pathname]);

  useEffect(() => {
    const onReload = () => reloadMeta();
    window.addEventListener("staff-branding-reload", onReload);
    return () => window.removeEventListener("staff-branding-reload", onReload);
  }, []);

  const brandName =
    meta?.brand?.nameTh ||
    meta?.brand?.name ||
    branding.siteName ||
    "SkillSale";
  const branchName = meta?.branchName || "";
  const logoUrl = meta?.brand?.logoUrl || branding.logoUrl;
  const coverUrl = meta?.brand?.coverImageUrl || null;
  const pendingOrders = meta?.pendingOrderCount ?? 0;

  const navActive: StaffShellTab =
    active === "key" || active === "stock" || active === "shift-stock"
      ? "home"
      : active;

  const tabs: {
    id: StaffShellTab;
    href: string;
    label: string;
    icon: ReactNode;
    badge?: number;
  }[] = [
    {
      id: "home",
      href: "/staff",
      label: "หน้าหลัก",
      icon: <IconHome size={24} />,
    },
    {
      id: "orders",
      href: "/staff/orders",
      label: "ออเดอร์",
      icon: <IconBasket size={24} />,
      badge: pendingOrders,
    },
    {
      id: "summary",
      href: "/staff/summary",
      label: "สรุปยอด",
      icon: <IconReceipt size={24} />,
    },
    {
      id: "settings",
      href: "/staff/settings",
      label: "ตั้งค่า",
      icon: <IconGear size={24} />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7] pb-[4.75rem]">
      {showHeader ? (
        <header className="relative overflow-hidden bg-site-primary text-white shadow-md">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center opacity-30"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35" />

          <div className="relative z-[60] mx-auto max-w-lg px-4 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/50 shadow-md">
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
                <p className="truncate text-[18px] font-extrabold leading-tight drop-shadow-sm">
                  {brandName}
                </p>
                <p className="mt-1 truncate text-sm font-medium text-white/90">
                  {branchName
                    ? `สาขา ${branchName.replace(/^สาขา\s*/, "")}`
                    : "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {active !== "home" ? (
                  <div
                    className="flex min-w-[7.25rem] flex-col items-start justify-center rounded-2xl bg-white px-3.5 py-2.5 text-left shadow-sm"
                    title="ยอดขายวันนี้ (ออเดอร์ที่สำเร็จแล้ว)"
                  >
                    <span className="text-[11px] font-semibold leading-none text-slate-500">
                      ยอดขายวันนี้
                    </span>
                    <span className="mt-1.5 truncate text-[17px] font-black leading-none tabular-nums text-site-primary">
                      ฿{formatPrice(meta?.todayRevenueBaht ?? 0)}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => logout("/staff/login")}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/50 bg-white/15 text-white"
                  aria-label="ออกจากระบบ"
                  title="ออกจากระบบ"
                >
                  <IconLogout size={20} />
                </button>
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
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 pt-1">
          {tabs.map((tab) => {
            const isActive = navActive === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`relative flex min-h-[3.75rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 ${
                  isActive ? "text-site-primary" : "text-slate-500"
                }`}
              >
                <span className="relative">
                  {tab.icon}
                  {(tab.badge ?? 0) > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-site-primary px-0.5 text-[11px] font-bold text-white">
                      {tab.badge! > 99 ? "99+" : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-[13px] font-bold">
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

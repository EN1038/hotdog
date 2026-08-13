"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import { logout } from "@/components/LoginForm";
import {
  IconHome,
  IconLogout,
  IconReceipt,
  IconStore,
} from "@/components/icons";
import { syncStaffBrandFromLogin } from "@/components/staff/StaffBrandingShell";
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

type BranchChoice = {
  branchId: string;
  branchName: string;
  brandName: string | null;
};

function formatBranchLabel(name: string) {
  return name.replace(/^สาขา\s*/i, "").trim() || name;
}

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
  const branchPickerId = useId();
  const [meta, setMeta] = useState<BrandingPayload | null>(null);
  const [branchChoices, setBranchChoices] = useState<BranchChoice[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState("");
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const reloadMeta = () => {
    fetch("/api/staff/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BrandingPayload | null) => {
        if (data) setMeta(data);
      })
      .catch(() => {});
  };

  const reloadBranches = () => {
    fetch("/api/staff/switch-branch")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            currentBranchId?: string;
            branches?: BranchChoice[];
          } | null,
        ) => {
          if (!data) return;
          setCurrentBranchId(data.currentBranchId ?? "");
          setBranchChoices(Array.isArray(data.branches) ? data.branches : []);
        },
      )
      .catch(() => {});
  };

  useEffect(() => {
    reloadMeta();
    reloadBranches();
  }, [pathname]);

  useEffect(() => {
    const onReload = () => {
      reloadMeta();
      reloadBranches();
    };
    window.addEventListener("staff-branding-reload", onReload);
    return () => window.removeEventListener("staff-branding-reload", onReload);
  }, []);

  useEffect(() => {
    if (!branchPickerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !switchingBranch) setBranchPickerOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [branchPickerOpen, switchingBranch]);

  async function switchBranch(branchId: string) {
    if (branchId === currentBranchId || switchingBranch) return;
    setSwitchingBranch(true);
    setSwitchError(null);
    try {
      const res = await fetch("/api/staff/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwitchError(
          typeof data.error === "string" ? data.error : "สลับสาขาไม่สำเร็จ",
        );
        return;
      }
      syncStaffBrandFromLogin(data.brand);
      window.location.assign("/staff");
    } catch {
      setSwitchError("เชื่อมต่อไม่ได้ — ลองใหม่");
    } finally {
      setSwitchingBranch(false);
    }
  }

  const brandName =
    meta?.brand?.nameTh ||
    meta?.brand?.name ||
    branding.siteName ||
    "SkillSale";
  const branchName = meta?.branchName || "";
  const logoUrl = meta?.brand?.logoUrl || branding.logoUrl;
  const coverUrl = meta?.brand?.coverImageUrl || null;
  const pendingOrders = meta?.pendingOrderCount ?? 0;
  const canSwitchBranch = branchChoices.length > 1;
  const branchLabel = branchName
    ? `สาขา ${formatBranchLabel(branchName)}`
    : "—";

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
                {canSwitchBranch ? (
                  <button
                    type="button"
                    id={branchPickerId}
                    onClick={() => {
                      setSwitchError(null);
                      setBranchPickerOpen(true);
                    }}
                    className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-left text-sm font-semibold text-white/95 shadow-sm backdrop-blur-[2px] transition active:bg-white/25"
                    aria-haspopup="dialog"
                    aria-expanded={branchPickerOpen}
                    title="สลับสาขา"
                  >
                    <span className="truncate">{branchLabel}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                      className="shrink-0 opacity-90"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : (
                  <p className="mt-1 truncate text-sm font-medium text-white/90">
                    {branchLabel}
                  </p>
                )}
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

      {branchPickerOpen && canSwitchBranch ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="ปิด"
            disabled={switchingBranch}
            onClick={() => setBranchPickerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${branchPickerId}-title`}
            className="relative z-10 w-full max-w-lg rounded-t-3xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-xl sm:mx-4 sm:rounded-3xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-start justify-between gap-3 px-1">
              <div>
                <h2
                  id={`${branchPickerId}-title`}
                  className="text-[17px] font-extrabold text-slate-900"
                >
                  สลับสาขา
                </h2>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  เลือกสาขาที่ต้องการทำงานตอนนี้
                </p>
              </div>
              <button
                type="button"
                disabled={switchingBranch}
                onClick={() => setBranchPickerOpen(false)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500"
              >
                ปิด
              </button>
            </div>
            {switchError ? (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {switchError}
              </p>
            ) : null}
            <ul className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pb-1">
              {branchChoices.map((b) => {
                const activeBranch = b.branchId === currentBranchId;
                return (
                  <li key={b.branchId}>
                    <button
                      type="button"
                      disabled={switchingBranch || activeBranch}
                      onClick={() => void switchBranch(b.branchId)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition ${
                        activeBranch
                          ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                          : "border-slate-200 bg-white text-slate-900 active:bg-slate-50"
                      } disabled:opacity-70`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">
                          {formatBranchLabel(b.branchName)}
                        </span>
                        {b.brandName ? (
                          <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                            {b.brandName}
                          </span>
                        ) : null}
                      </span>
                      {activeBranch ? (
                        <span className="shrink-0 text-xs font-bold text-emerald-700">
                          ใช้อยู่
                        </span>
                      ) : switchingBranch ? (
                        <span className="shrink-0 text-xs font-semibold text-slate-400">
                          …
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-semibold text-site-primary">
                          เลือก
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
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

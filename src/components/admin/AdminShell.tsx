"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { logout } from "@/components/LoginForm";
import { PlatformMark } from "@/components/PlatformMark";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  AdminBranchSwitcher,
  isAdminBranchPath,
} from "@/components/admin/AdminBranchSwitcher";
import {
  IconClose,
  IconHome,
  IconMoney,
  IconPackage,
  IconReceipt,
  IconStore,
  IconUser,
} from "@/components/icons";
import { getBrandProfileGaps } from "@/lib/brand-profile";
import {
  brandHqHref,
  parseBrandHqSection,
  resolveBrandHqBasePath,
  type BrandHqSection,
} from "@/lib/brand-hq-nav";

export {
  adminInputClass,
  adminLabelClass,
  adminCardClass,
  adminTableWrapClass,
  adminTableClass,
  adminTheadClass,
  adminThClass,
  adminTrClass,
  adminTrHoverClass,
  adminSelectClass,
  adminEmptyClass,
  btnPrimary,
  btnDark,
  btnOutline,
  btnDanger,
  btnPrimaryXl,
  AdminPageHeader,
  AdminEmptyState,
  AdminLoadingState,
} from "@/components/admin/admin-ui";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  match?: (pathname: string, searchParams: URLSearchParams) => boolean;
  platformOnly?: boolean;
  /** Hide from platform admins (brand operator pages) */
  brandAdminOnly?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  badgeTone?: "warn" | "info";
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "ภาพรวม",
    items: [
      {
        href: "/admin",
        label: "แดชบอร์ด",
        exact: true,
        match: (pathname) =>
          pathname === "/admin" ||
          pathname.startsWith("/admin/branches") ||
          (/^\/admin\/brands\/[^/]+$/.test(pathname) &&
            !pathname.endsWith("/admins")),
        icon: IconHome,
      },
    ],
  },
  {
    title: "ร้านค้า",
    items: [
      {
        href: "/admin/brands",
        label: "โปรไฟล์แบรนด์",
        exact: true,
        match: (pathname) => pathname === "/admin/brands",
        brandAdminOnly: true,
        icon: IconStore,
      },
      {
        href: "/admin/stock",
        label: "สต๊อกบ้านกลาง",
        brandAdminOnly: true,
        match: (pathname) =>
          pathname === "/admin/stock" ||
          /^\/admin\/brands\/[^/]+\/stock(\/.*)?$/.test(pathname),
        icon: IconPackage,
      },
      {
        href: "/admin/team",
        label: "ผู้ดูแลแบรนด์",
        brandAdminOnly: true,
        match: (pathname) =>
          pathname === "/admin/team" ||
          /^\/admin\/brands\/[^/]+\/admins$/.test(pathname),
        icon: IconUser,
      },
    ],
  },
  {
    title: "ออเดอร์",
    items: [
      {
        href: "/admin/customers",
        label: "ออเดอร์",
        icon: IconUser,
      },
      {
        href: "/admin/logs",
        label: "ประวัติการใช้งาน",
        icon: IconReceipt,
      },
    ],
  },
  {
    title: "ระบบ",
    items: [
      {
        href: "/admin/restaurant-types",
        label: "ประเภทร้าน",
        platformOnly: true,
        icon: IconTag,
      },
      {
        href: "/admin/alert-sounds",
        label: "เสียงแจ้งเตือน",
        platformOnly: true,
        icon: IconVolume,
      },
      {
        href: "/admin/site",
        label: "ตั้งค่าแพลตฟอร์ม",
        platformOnly: true,
        icon: IconSettings,
      },
    ],
  },
];

function brandHqNavItems(basePath: string): NavItem[] {
  const sections: {
    section: BrandHqSection;
    label: string;
    icon: NavItem["icon"];
  }[] = [
    { section: "home", label: "หน้าแรก", icon: IconHome },
    { section: "stock_now", label: "สต๊อกปัจจุบัน", icon: IconPackage },
    { section: "restock", label: "เติม", icon: IconPlusNav },
    { section: "issue", label: "จ่าย", icon: IconMoney },
  ];
  return sections.map(({ section, label, icon }) => ({
    href: brandHqHref(basePath, section),
    label,
    exact: true,
    icon,
    match: (pathname, searchParams) => {
      if (pathname !== basePath) return false;
      return parseBrandHqSection(searchParams.get("section")) === section;
    },
  }));
}

function IconPlusNav({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className ? `block shrink-0 ${className}` : "block shrink-0"}
      aria-hidden
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function IconTag({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className ? `block shrink-0 ${className}` : "block shrink-0"}
      aria-hidden
    >
      <path
        d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V4h9l8.6 8.6a2 2 0 010 2.8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="8.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconVolume({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className ? `block shrink-0 ${className}` : "block shrink-0"}
      aria-hidden
    >
      <path
        d="M11 5L6 9H3v6h3l5 4V5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 8.5a5 5 0 010 7M18 6a8 8 0 010 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className ? `block shrink-0 ${className}` : "block shrink-0"}
      aria-hidden
    >
      <path
        d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c0 .7.4 1.3 1.1 1.5H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMenu({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className ? `block shrink-0 ${className}` : "block shrink-0"}
      aria-hidden
    >
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function isActive(
  pathname: string,
  searchParams: URLSearchParams,
  item: NavItem,
) {
  if (item.match) return item.match(pathname, searchParams);
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function filterNavGroups(
  isPlatformAdmin: boolean,
  pathname: string,
  soleBrandId?: string | null,
): NavGroup[] {
  const hqBase = resolveBrandHqBasePath(pathname, {
    isPlatformAdmin,
    soleBrandId,
  });

  return NAV_GROUPS.map((group) => {
    if (group.title === "ภาพรวม") {
      if (hqBase) {
        return { ...group, items: brandHqNavItems(hqBase) };
      }
      return {
        ...group,
        items: group.items.map((item) => {
          if (item.href === "/admin" && isPlatformAdmin) {
            return { ...item, label: "แบรนด์" };
          }
          return item;
        }),
      };
    }
    return {
      ...group,
      items: group.items.filter((item) => {
        if (item.platformOnly && !isPlatformAdmin) return false;
        if (item.brandAdminOnly && isPlatformAdmin) return false;
        return true;
      }),
    };
  }).filter((group) => group.items.length > 0);
}

function RoleBadge({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isPlatformAdmin
          ? "bg-slate-900 text-white"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {isPlatformAdmin ? "แพลตฟอร์ม" : "แบรนด์"}
    </span>
  );
}

function SidebarNav({
  pathname,
  searchParams,
  navGroups,
  onNavigate,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  navGroups: NavGroup[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
      {navGroups.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, searchParams, item);
              const Icon = item.icon;
              const warn = item.badgeTone === "warn" && item.badge;
              return (
                <li key={`${item.href}:${item.label}`}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={
                      warn
                        ? `${item.label} — โปรไฟล์ยังไม่ครบ ${item.badge} รายการ`
                        : undefined
                    }
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                      active
                        ? "bg-site-primary font-semibold text-white shadow-sm shadow-slate-900/15"
                        : warn
                          ? "font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-50"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      size={17}
                      className={
                        active
                          ? "text-white"
                          : warn
                            ? "text-amber-600"
                            : "text-slate-400"
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`tab-attention-dot inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                          active
                            ? "bg-white/25 text-white"
                            : "bg-amber-400 text-amber-950"
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ShellHeader() {
  return (
    <div className="flex items-center justify-center border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-3 py-3">
      <PlatformMark placement="sidebar" height={40} />
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useAdminSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandProfileGapCount, setBrandProfileGapCount] = useState(0);
  const [branchMeta, setBranchMeta] = useState<{
    name: string;
    brandName: string | null;
  } | null>(null);

  const isPlatformAdmin = session?.isPlatformAdmin ?? false;
  const soleBrandId =
    !isPlatformAdmin && session?.brandIds.length === 1
      ? session.brandIds[0]
      : null;
  const onBranchPage = isAdminBranchPath(pathname);
  const navGroups = useMemo(
    () => filterNavGroups(isPlatformAdmin, pathname, soleBrandId),
    [isPlatformAdmin, pathname, soleBrandId],
  );

  const handleBranchMeta = useCallback(
    (meta: { name: string; brandName: string | null } | null) => {
      setBranchMeta(meta);
    },
    [],
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!onBranchPage) setBranchMeta(null);
  }, [onBranchPage]);

  useEffect(() => {
    if (!session || session.isPlatformAdmin) {
      setBrandProfileGapCount(0);
      return;
    }

    let cancelled = false;

    function loadGaps() {
      fetch("/api/admin/brands")
        .then(async (res) => {
          if (!res.ok) return;
          const brands = (await res.json()) as Array<{
            logoUrl?: string | null;
            coverImageUrl?: string | null;
          }>;
          if (cancelled) return;
          const count = brands.reduce(
            (sum, brand) => sum + getBrandProfileGaps(brand).length,
            0,
          );
          setBrandProfileGapCount(count);
        })
        .catch(() => {
          /* ignore */
        });
    }

    loadGaps();
    const onUpdated = () => loadGaps();
    window.addEventListener("brand-profile-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("brand-profile-updated", onUpdated);
    };
  }, [session, pathname]);

  const navGroupsWithBadges = useMemo(() => {
    if (brandProfileGapCount <= 0) return navGroups;
    return navGroups.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        item.href === "/admin/brands"
          ? {
              ...item,
              badge: String(brandProfileGapCount),
              badgeTone: "warn" as const,
            }
          : item,
      ),
    }));
  }, [navGroups, brandProfileGapCount]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const currentLabel =
    navGroupsWithBadges
      .flatMap((g) => g.items)
      .find((item) => isActive(pathname, searchParams, item))?.label ??
    "หลังบ้าน";

  const headerTitle = onBranchPage
    ? branchMeta?.name ?? "สาขา"
    : currentLabel;
  const headerSubtitle = onBranchPage
    ? branchMeta?.brandName
      ? `แบรนด์ · ${branchMeta.brandName}`
      : "สลับสาขาได้จากเมนูด้านบน"
    : isPlatformAdmin
      ? "จัดการแพลตฟอร์มและร้านค้า"
      : "จัดการแบรนด์และสาขาของคุณ";

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <ShellHeader />

        <SidebarNav
          pathname={pathname}
          searchParams={searchParams}
          navGroups={navGroupsWithBadges}
        />

        <div className="border-t border-slate-200 p-2.5">
          <button
            type="button"
            onClick={() => logout("/admin/login")}
            className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="ปิดเมนู"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(16.5rem,85vw)] flex-col border-r border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="relative flex items-center justify-center border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-3 py-3">
              <div className="flex min-w-0 flex-1 items-center justify-center">
                <PlatformMark placement="sidebar" height={40} />
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute top-2.5 right-2.5 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <SidebarNav
              pathname={pathname}
              searchParams={searchParams}
              navGroups={navGroupsWithBadges}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="border-t border-slate-200 p-2.5">
              <button
                type="button"
                onClick={() => logout("/admin/login")}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                ออกจากระบบ
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-3 py-2.5 backdrop-blur-md lg:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              aria-label="เปิดเมนู"
            >
              <IconMenu size={20} />
            </button>

            {onBranchPage ? (
              <Suspense
                fallback={
                  <div className="h-10 min-w-[10rem] animate-pulse rounded-xl bg-slate-100" />
                }
              >
                <AdminBranchSwitcher onBranchMeta={handleBranchMeta} />
              </Suspense>
            ) : (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {headerTitle}
                </p>
                <p className="hidden truncate text-xs text-slate-500 sm:block">
                  {headerSubtitle}
                </p>
              </div>
            )}

            {onBranchPage && branchMeta?.brandName ? (
              <p className="hidden min-w-0 truncate text-xs text-slate-500 md:block">
                {branchMeta.brandName}
              </p>
            ) : null}
          </div>

          {session?.username && (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <RoleBadge isPlatformAdmin={isPlatformAdmin} />
              <span className="max-w-[8rem] truncate text-sm text-slate-600 lg:max-w-[12rem]">
                {session.username}
              </span>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

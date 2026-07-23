"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/components/LoginForm";
import { PlatformMark } from "@/components/PlatformMark";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  IconClose,
  IconHome,
  IconReceipt,
  IconStore,
  IconUser,
} from "@/components/icons";
import { getBrandProfileGaps } from "@/lib/brand-profile";

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
  match?: (pathname: string) => boolean;
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
        href: "/admin/site",
        label: "ตั้งค่าแพลตฟอร์ม",
        platformOnly: true,
        icon: IconSettings,
      },
      {
        href: "/admin/line",
        label: "LINE แจ้งเตือน",
        platformOnly: true,
        icon: IconChat,
      },
      {
        href: "/admin/line-connect",
        label: "เชื่อม LINE",
        icon: IconChat,
      },
    ],
  },
];

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

function IconChat({
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
        d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z"
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

function isActive(pathname: string, item: NavItem) {
  if (item.match) return item.match(pathname);
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function filterNavGroups(isPlatformAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .map((item) => {
        if (item.href === "/admin" && isPlatformAdmin) {
          return { ...item, label: "แบรนด์" };
        }
        return item;
      })
      .filter((item) => {
        if (item.platformOnly && !isPlatformAdmin) return false;
        if (item.brandAdminOnly && isPlatformAdmin) return false;
        return true;
      }),
  })).filter((group) => group.items.length > 0);
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
  navGroups,
  onNavigate,
}: {
  pathname: string;
  navGroups: NavGroup[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {navGroups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {group.title}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              const warn = item.badgeTone === "warn" && item.badge;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={
                      warn
                        ? `${item.label} — โปรไฟล์ยังไม่ครบ ${item.badge} รายการ`
                        : undefined
                    }
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-site-primary font-semibold text-white shadow-md shadow-slate-900/20"
                        : warn
                          ? "font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-50"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      size={18}
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
    <div className="flex items-center justify-center border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6">
      <PlatformMark placement="sidebar" height={80} />
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useAdminSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandProfileGapCount, setBrandProfileGapCount] = useState(0);

  const isPlatformAdmin = session?.isPlatformAdmin ?? false;
  const navGroups = useMemo(
    () => filterNavGroups(isPlatformAdmin),
    [isPlatformAdmin],
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      .find((item) => isActive(pathname, item))?.label ?? "หลังบ้าน";

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <ShellHeader />

        <SidebarNav pathname={pathname} navGroups={navGroupsWithBadges} />

        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={() => logout("/admin/login")}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
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
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="relative flex items-center justify-center border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6">
              <div className="flex items-center justify-center min-w-0 flex-1">
                <PlatformMark placement="sidebar" height={80} />
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <SidebarNav
              pathname={pathname}
              navGroups={navGroupsWithBadges}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="border-t border-slate-200 p-3">
              <button
                type="button"
                onClick={() => logout("/admin/login")}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                ออกจากระบบ
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3.5 backdrop-blur-md lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              aria-label="เปิดเมนู"
            >
              <IconMenu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {currentLabel}
              </p>
              <p className="hidden text-xs text-slate-500 sm:block">
                {isPlatformAdmin
                  ? "จัดการแพลตฟอร์มและร้านค้า"
                  : "จัดการแบรนด์และสาขาของคุณ"}
              </p>
            </div>
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

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

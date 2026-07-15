"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/components/LoginForm";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  IconClose,
  IconHome,
  IconReceipt,
  IconStore,
  IconUser,
} from "@/components/icons";

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
          /^\/admin\/brands\/[^/]+/.test(pathname),
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
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-red-600 font-semibold text-white shadow-md shadow-red-600/25"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={active ? "text-white" : "text-slate-400"}
                    />
                    {item.label}
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

function ShellHeader({
  username,
  isPlatformAdmin,
}: {
  username?: string;
  isPlatformAdmin: boolean;
}) {
  return (
    <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-red-50/40 px-5 py-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-xs font-bold text-white shadow-sm shadow-red-600/30">
        S
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">
        SkillSale CMS
      </p>
      <h1 className="mt-1 text-base font-bold text-slate-900">
        ระบบจัดการหลังบ้าน
      </h1>
      {username && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RoleBadge isPlatformAdmin={isPlatformAdmin} />
          <span className="truncate text-sm text-slate-600">{username}</span>
        </div>
      )}
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useAdminSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPlatformAdmin = session?.isPlatformAdmin ?? false;
  const navGroups = useMemo(
    () => filterNavGroups(isPlatformAdmin),
    [isPlatformAdmin],
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const currentLabel =
    navGroups.flatMap((g) => g.items).find((item) => isActive(pathname, item))
      ?.label ?? "หลังบ้าน";

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <ShellHeader
          username={session?.username}
          isPlatformAdmin={isPlatformAdmin}
        />

        <SidebarNav pathname={pathname} navGroups={navGroups} />

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => logout("/admin/login")}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
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
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">
                  SkillSale CMS
                </p>
                <h1 className="mt-1 text-base font-bold text-slate-900">
                  ระบบจัดการหลังบ้าน
                </h1>
                {session?.username && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RoleBadge isPlatformAdmin={isPlatformAdmin} />
                    <span className="truncate text-sm text-slate-600">
                      {session.username}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="ml-2 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <SidebarNav
              pathname={pathname}
              navGroups={navGroups}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="border-t border-slate-100 p-3">
              <button
                type="button"
                onClick={() => logout("/admin/login")}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                ออกจากระบบ
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3.5 shadow-sm shadow-slate-900/5 backdrop-blur-md lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
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

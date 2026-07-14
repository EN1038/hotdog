"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/components/LoginForm";
import {
  IconClose,
  IconHome,
  IconPackage,
  IconStore,
  IconUser,
} from "@/components/icons";

export const adminInputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400";

export const adminLabelClass = "mb-1 block text-sm font-semibold text-gray-800";

/** Shared admin button styles (desktop hover via `@media (hover: hover)`) */
export const btnPrimary =
  "cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 hover:shadow active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50";

export const btnDark =
  "cursor-pointer rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-900 hover:shadow active:bg-black disabled:cursor-not-allowed disabled:opacity-50";

export const btnOutline =
  "cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50";

export const btnDanger =
  "cursor-pointer rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 transition hover:border-red-400 hover:bg-red-50 hover:text-red-800 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimaryXl =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 hover:shadow active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  match?: (pathname: string) => boolean;
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
          pathname === "/admin" || pathname.startsWith("/admin/branches"),
        icon: IconHome,
      },
    ],
  },
  {
    title: "ร้านค้า",
    items: [
      {
        href: "/admin/menu",
        label: "เมนู",
        icon: IconPackage,
      },
      {
        href: "/admin/brands",
        label: "แบรนด์",
        icon: IconStore,
      },
    ],
  },
  {
    title: "ลูกค้า",
    items: [
      {
        href: "/admin/customers",
        label: "ลูกค้า",
        icon: IconUser,
      },
    ],
  },
  {
    title: "ระบบ",
    items: [
      {
        href: "/admin/site",
        label: "ตั้งค่าเว็บ",
        icon: IconSettings,
      },
    ],
  },
];

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

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {group.title}
          </p>
          <ul className="space-y-0.5">
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
                        ? "bg-red-600 font-semibold text-white shadow-sm"
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const currentLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((item) => isActive(pathname, item))
      ?.label ?? "หลังบ้าน";

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-100 px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
            HunterDog CMS
          </p>
          <h1 className="mt-1 text-base font-bold text-slate-900">
            ระบบจัดการหลังบ้าน
          </h1>
        </div>

        <SidebarNav pathname={pathname} />

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => logout()}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="ปิดเมนู"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
                  HunterDog CMS
                </p>
                <h1 className="mt-1 text-base font-bold text-slate-900">
                  ระบบจัดการหลังบ้าน
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <SidebarNav
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="border-t border-slate-100 p-3">
              <button
                type="button"
                onClick={() => logout()}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                ออกจากระบบ
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="เปิดเมนู"
            >
              <IconMenu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {currentLabel}
              </p>
              <p className="hidden text-xs text-slate-500 sm:block">
                จัดการเนื้อหาและร้านค้าผ่าน CMS
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/components/LoginForm";

const NAV = [
  { href: "/admin", label: "แดชบอร์ด", exact: true },
  { href: "/admin/brands", label: "แบรนด์" },
  { href: "/admin/site", label: "ตั้งค่าเว็บ" },
  { href: "/admin/customers", label: "ลูกค้า" },
];

export const adminInputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900";

export const adminLabelClass = "mb-1 block text-sm font-medium text-gray-700";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-red-600">
              HunterDog CMS
            </p>
            <h1 className="text-lg font-bold text-gray-900">ระบบจัดการหลังบ้าน</h1>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ออกจากระบบ
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                  active
                    ? "bg-red-600 font-medium text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl p-4">{children}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { IconBack } from "@/components/icons";
import {
  readStaffOrderMode,
  writeStaffOrderMode,
  type StaffOrderMode,
} from "@/lib/staff-order-mode";

export function StaffKeyOrderLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mode, setMode] = useState<StaffOrderMode>("instant");

  useEffect(() => {
    setMode(readStaffOrderMode());
  }, []);

  function toggleMode() {
    setMode((prev) => {
      const next: StaffOrderMode = prev === "instant" ? "normal" : "instant";
      writeStaffOrderMode(next);
      return next;
    });
  }

  const isInstant = mode === "instant";

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg overflow-x-hidden bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/staff"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="กลับ"
          >
            <IconBack size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-gray-900">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs text-gray-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleMode}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold transition active:scale-[0.98] ${
              isInstant
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
            title={
              isInstant
                ? "โหมดสำเร็จทันที: สั่งแล้วจบทันที"
                : "โหมดคิว: สั่งแล้วเข้าคิวตามปกติ"
            }
          >
            <span
              className={`flex h-1.5 w-1.5 rounded-full ${
                isInstant ? "bg-white" : "bg-amber-500"
              }`}
            />
            {isInstant ? "สำเร็จทันที" : "โหมดคิว"}
          </button>
        </div>
      </header>
      <div className="w-full min-w-0 space-y-4 px-4 py-4">{children}</div>
      {footer ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-lg">{footer}</div>
        </div>
      ) : null}
    </main>
  );
}

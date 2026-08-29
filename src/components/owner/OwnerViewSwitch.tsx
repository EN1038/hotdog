"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/components/LoginForm";
import { IconLogout } from "@/components/icons";
import {
  assignOwnerViewHome,
  getOwnerViewPreference,
  OWNER_VIEW_LABELS,
  ownerViewHomePath,
  resolveOwnerView,
  setOwnerViewPreference,
  type OwnerViewMode,
  type OwnerViewPreference,
} from "@/lib/owner-view-preference";
import { counterpartBranchAdminPath } from "@/lib/branch-admin-path";

export { assignOwnerViewHome };

/**
 * Soft-redirect exact shell homes only (`/owner` ↔ `/admin`).
 * Skips deep links so manage-from-owner still works.
 */
export function useOwnerViewHomeSoftRedirect(
  currentHome: OwnerViewMode | null,
) {
  const router = useRouter();

  useEffect(() => {
    if (!currentHome) return;
    const target = ownerViewHomePath(resolveOwnerView());
    const here = ownerViewHomePath(currentHome);
    if (target !== here) {
      router.replace(target);
    }
  }, [currentHome, router]);
}

/** Compact control — pick auto / mobile / desktop and navigate home */
export function OwnerViewSwitchButton({
  variant = "light",
  /** Platform admin stays on /admin — only toggles layout, no /owner redirect */
  skipOwnerRouteSwitch = false,
}: {
  variant?: "light" | "onPrimary" | "admin";
  skipOwnerRouteSwitch?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<OwnerViewPreference>("auto");

  useEffect(() => {
    setPref(getOwnerViewPreference());
  }, []);

  function apply(next: OwnerViewPreference) {
    setOwnerViewPreference(next);
    setPref(next);
    setOpen(false);
    const view = resolveOwnerView(next);
    const path =
      typeof window !== "undefined" ? window.location.pathname : "";
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    if (!skipOwnerRouteSwitch) {
      const branchCounterpart = counterpartBranchAdminPath(path, search);
      if (branchCounterpart && (next === "mobile" || next === "desktop")) {
        router.replace(branchCounterpart);
        return;
      }
      const isShellHome = path === "/admin" || path === "/owner";
      if (isShellHome) {
        router.replace(ownerViewHomePath(view));
      }
    }
  }

  const triggerClass =
    variant === "onPrimary"
      ? "rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-[12px] font-bold text-white"
      : variant === "admin"
        ? "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
        : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 shadow-sm";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        มุมมอง ·{" "}
        {pref === "auto" ? "อัตโนมัติ" : pref === "mobile" ? "มือถือ" : "เว็บไซต์"}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="ปิด"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl"
          >
            {(
              [
                "auto",
                "mobile",
                "desktop",
              ] as const satisfies readonly OwnerViewPreference[]
            ).map((option) => {
              const active = pref === option;
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => apply(option)}
                    className={`flex w-full px-4 py-2.5 text-left text-[13px] font-semibold ${
                      active
                        ? "bg-site-primary/10 text-site-primary"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {OWNER_VIEW_LABELS[option]}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Avatar on owner header — replaces view/logout pills */
export function OwnerProfileMenuButton({
  photoUrl,
  displayName,
  username,
  fallbackIcon,
}: {
  photoUrl?: string | null;
  displayName: string;
  username?: string | null;
  fallbackIcon?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<OwnerViewPreference>("auto");

  useEffect(() => {
    setPref(getOwnerViewPreference());
  }, []);

  function applyView(next: OwnerViewPreference) {
    setOwnerViewPreference(next);
    setPref(next);
    setOpen(false);
    const view = resolveOwnerView(next);
    const path =
      typeof window !== "undefined" ? window.location.pathname : "";
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    const branchCounterpart = counterpartBranchAdminPath(path, search);
    if (branchCounterpart && (next === "mobile" || next === "desktop")) {
      router.replace(branchCounterpart);
      return;
    }
    const isShellHome = path === "/admin" || path === "/owner";
    if (isShellHome) {
      router.replace(ownerViewHomePath(view));
    }
  }

  const initial = (
    displayName.trim().charAt(0) ||
    username?.trim().charAt(0) ||
    "ร"
  ).toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/50 bg-white/15 shadow-sm ring-2 ring-white/40 active:scale-95"
        aria-label="เมนูบัญชี"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : fallbackIcon ? (
          <span className="flex h-full w-full items-center justify-center text-white">
            {fallbackIcon}
          </span>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-base font-extrabold text-white">
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="ปิด"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="เมนูบัญชี"
            className="relative z-10 w-full max-w-md rounded-t-3xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-xl sm:mx-4 sm:rounded-3xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-4 flex items-center gap-3 px-1">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-2 ring-slate-200">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-extrabold text-slate-500">
                    {initial}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-extrabold text-slate-900">
                  {displayName}
                </p>
                {username ? (
                  <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">
                    @{username}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[13px] font-medium text-slate-500">
                    บัญชีเจ้าของร้าน
                  </p>
                )}
              </div>
            </div>

            <p className="mb-1.5 px-1 text-[12px] font-bold text-slate-500">
              มุมมองหน้าจอ
            </p>
            <div className="mb-3 overflow-hidden rounded-2xl bg-slate-50">
              {(
                [
                  "auto",
                  "mobile",
                  "desktop",
                ] as const satisfies readonly OwnerViewPreference[]
              ).map((option) => {
                const active = pref === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => applyView(option)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-semibold ${
                      active
                        ? "bg-site-primary/10 text-site-primary"
                        : "text-slate-800 active:bg-slate-100"
                    }`}
                  >
                    <span>{OWNER_VIEW_LABELS[option]}</span>
                    {active ? (
                      <span className="text-[12px] font-bold">ใช้อยู่</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-2xl bg-slate-50">
              <Link
                href="/owner/settings"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[14px] font-extrabold text-slate-900 active:bg-slate-100"
              >
                ตั้งค่า
                <span className="text-slate-300" aria-hidden>
                  ›
                </span>
              </Link>
              <button
                type="button"
                onClick={() => logout("/owner/login")}
                className="flex w-full items-center gap-2 border-t border-slate-200/80 px-4 py-3.5 text-left text-[14px] font-extrabold text-rose-600 active:bg-rose-50"
              >
                <IconLogout size={18} />
                ออกจากระบบ
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded-2xl py-3 text-[14px] font-bold text-slate-500"
            >
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

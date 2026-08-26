"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconPlus, IconStore } from "@/components/icons";
import {
  isOwnerBranchAdminPath,
  parseBranchAdminId,
} from "@/lib/branch-admin-path";
import { isTestBranch } from "@/lib/branch-test";

type BranchOption = {
  id: string;
  name: string;
  code: string | null;
  brandId: string | null;
  isTest?: boolean;
  brand: { id: string; name: string; code: string } | null;
};

export function OwnerBranchSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentId = parseBranchAdminId(pathname);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/branches");
      if (!res.ok) return;
      const data = (await res.json()) as BranchOption[];
      setBranches(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentId || !isOwnerBranchAdminPath(pathname)) return;
    void load();
  }, [currentId, load, pathname]);

  const current = useMemo(
    () => branches.find((b) => b.id === currentId) ?? null,
    [branches, currentId],
  );

  const preferredBrandId = current?.brandId ?? null;
  const hasMultiple = branches.length > 1;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = branches;
    if (!needle && preferredBrandId) {
      const sameBrand = list.filter((b) => b.brandId === preferredBrandId);
      if (sameBrand.length > 0) list = sameBrand;
    }
    if (!needle) return list;
    return list.filter((b) => {
      const hay = [b.name, b.code ?? "", b.brand?.name ?? "", b.brand?.code ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [branches, preferredBrandId, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    queueMicrotask(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!currentId || !isOwnerBranchAdminPath(pathname)) return null;

  function goToBranch(id: string) {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    const ownerMatch = pathname.match(/^\/owner\/branches\/[^/]+(.*)$/);
    const suffix = ownerMatch?.[1] ?? "";
    const qs = searchParams.toString();
    const search = qs ? `?${qs}` : "";
    const href = `/owner/branches/${id}${suffix}${search}`;
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const label = current?.name ?? (loading ? "กำลังโหลด…" : "เลือกสาขา");

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition active:bg-slate-50"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-site-primary-soft text-site-primary">
            <IconStore size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {hasMultiple ? "สลับสาขา" : "สาขานี้"}
            </span>
            <span className="block truncate text-[15px] font-extrabold text-slate-900">
              {label}
            </span>
          </span>
          <span className="shrink-0 text-slate-400" aria-hidden>
            ▾
          </span>
        </button>

        <Link
          href="/admin"
          className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center shadow-sm transition active:bg-slate-50"
          title="จัดการและเพิ่มสาขา"
        >
          <IconPlus size={18} className="text-site-primary" />
          <span className="mt-0.5 text-[10px] font-bold text-slate-600">
            สาขา
          </span>
        </Link>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {hasMultiple ? (
            <div className="border-b border-slate-100 p-2">
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาสาขา…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
              />
            </div>
          ) : null}
          <ul
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
            aria-label="รายการสาขา"
          >
            {loading && branches.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500">กำลังโหลด…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500">ไม่พบสาขา</li>
            ) : (
              filtered.map((b) => {
                const active = b.id === currentId;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => goToBranch(b.id)}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? "bg-site-primary-soft font-semibold text-site-primary-focus"
                          : "text-slate-700 active:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{b.name}</span>
                        {isTestBranch(b) ? (
                          <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
                            ทดลอง
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-[11px] font-normal text-slate-400">
                        {[b.brand?.name, b.code ? `/${b.code}` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="space-y-0.5 border-t border-slate-100 p-2">
            <Link
              href="/owner/branches"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 active:bg-slate-50"
            >
              ดูทุกสาขา
              <span className="text-slate-300" aria-hidden>
                ›
              </span>
            </Link>
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-site-primary active:bg-site-primary-soft"
            >
              จัดการและเพิ่มสาขา
              <span className="text-site-primary/40" aria-hidden>
                ›
              </span>
            </Link>
          </div>
          {hasMultiple &&
          preferredBrandId &&
          branches.some((b) => b.brandId !== preferredBrandId) ? (
            <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
              แสดงสาขาในแบรนด์เดียวกัน · ค้นหาเพื่อดูทั้งหมด
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
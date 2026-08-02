"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type BranchOption = {
  id: string;
  name: string;
  code: string | null;
  brandId: string | null;
  brand: { id: string; name: string; code: string } | null;
};

function parseBranchId(pathname: string): string | null {
  const m = pathname.match(/^\/admin\/branches\/([^/]+)/);
  return m?.[1] ?? null;
}

export function AdminBranchSwitcher({
  onBranchMeta,
}: {
  onBranchMeta?: (meta: { name: string; brandName: string | null } | null) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentId = parseBranchId(pathname);
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
    if (!currentId) {
      onBranchMeta?.(null);
      return;
    }
    void load();
  }, [currentId, load, onBranchMeta]);

  const current = useMemo(
    () => branches.find((b) => b.id === currentId) ?? null,
    [branches, currentId],
  );

  useEffect(() => {
    if (!currentId) {
      onBranchMeta?.(null);
      return;
    }
    if (current) {
      onBranchMeta?.({
        name: current.name,
        brandName: current.brand?.name ?? null,
      });
    }
  }, [current, currentId, onBranchMeta]);

  const preferredBrandId = current?.brandId ?? null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = branches;
    // Without search, prefer same-brand siblings; with search, look across accessible branches
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

  if (!currentId) return null;

  function goToBranch(id: string) {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    const tab = searchParams.get("tab");
    const href =
      tab && pathname === `/admin/branches/${currentId}`
        ? `/admin/branches/${id}?tab=${encodeURIComponent(tab)}`
        : `/admin/branches/${id}`;
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const label = current?.name ?? (loading ? "กำลังโหลด…" : "เลือกสาขา");

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            สาขา
          </span>
          <span className="block truncate text-sm font-semibold text-slate-900">
            {label}
          </span>
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสาขา…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
            />
          </div>
          <ul
            role="listbox"
            className="max-h-72 overflow-y-auto py-1"
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
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate">{b.name}</span>
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
          {preferredBrandId && branches.some((b) => b.brandId !== preferredBrandId) ? (
            <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
              แสดงสาขาในแบรนด์เดียวกัน · ค้นหาเพื่อดูทั้งหมดในสิทธิ์ของคุณ
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function isAdminBranchPath(pathname: string) {
  return Boolean(parseBranchId(pathname));
}

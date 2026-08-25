"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconStore } from "@/components/icons";
import type { OwnerBranchRow } from "@/lib/owner-dashboard";

/** ไอคอนกรองสาขา — กดแล้วค่อยโชว์รายการ (เมื่อมีมากกว่า 1 สาขา) */
export function OwnerBranchFilterBar({
  branches,
  value,
  onChange,
  className = "",
}: {
  branches: OwnerBranchRow[];
  /** null = ทุกสาขา */
  value: string | null;
  onChange: (branchId: string | null) => void;
  className?: string;
}) {
  const options = branches.filter(
    (b) => !b.isHidden && b.kind !== "WAREHOUSE",
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (options.length <= 1) return null;

  const selected = value ? options.find((b) => b.id === value) : null;
  const filtered = selected != null;

  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        aria-label={
          filtered ? `กรองสาขา · ${selected.name}` : "เลือกดูตามสาขา"
        }
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        title={filtered ? selected.name : "ดูตามสาขา"}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full ${
          filtered || open
            ? "bg-emerald-700 text-white"
            : "bg-white text-slate-600 ring-1 ring-slate-200"
        }`}
      >
        <IconStore size={18} />
        {filtered ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white"
            aria-hidden
          />
        ) : null}
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="เลือกสาขา"
          className="absolute right-0 z-30 mt-1.5 max-h-64 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-white py-1.5 shadow-lg ring-1 ring-slate-200"
        >
          <p className="px-3 pb-1 pt-1 text-[11px] font-bold text-slate-500">
            ดูตามสาขา
          </p>
          <button
            type="button"
            role="option"
            aria-selected={value == null}
            onClick={() => pick(null)}
            className={`flex w-full items-center px-3 py-2.5 text-left text-[13px] font-bold ${
              value == null
                ? "bg-emerald-50 text-emerald-900"
                : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            ทุกสาขา
          </button>
          {options.map((b) => {
            const active = value === b.id;
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(b.id)}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-bold ${
                  active
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {!b.isOpen ? (
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                    ปิด
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

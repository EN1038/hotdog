"use client";

import { useEffect, useState } from "react";
import { IconBack, IconSkewerPlaceholder } from "@/components/icons";
import {
  normalizeSkewerOrderQty,
  SKEWER_PHOTO_ASPECT_CLASS,
} from "@/lib/skewer-order";

function normalizeDraftQty(raw: string, minQty: number): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return normalizeSkewerOrderQty(n, { skewerMinQty: minQty });
}

export function SkewerMenuItemQtyDetail({
  name,
  imageUrl,
  qtyUnit = "ไม้",
  sticksPerUnit = 1,
  countsAsSticks = true,
  minQty = 1,
  draftQty,
  onDraftChange,
  onBack,
  onConfirm,
}: {
  name: string;
  imageUrl: string | null;
  qtyUnit?: string;
  sticksPerUnit?: number;
  countsAsSticks?: boolean;
  minQty?: number;
  draftQty: number;
  onDraftChange: (next: number) => void;
  onBack: () => void;
  onConfirm: (qty: number) => void;
}) {
  const [qtyText, setQtyText] = useState(() => String(draftQty || 0));
  const [editing, setEditing] = useState(false);
  const unit = qtyUnit.trim() || "ไม้";
  const per = Math.max(1, Math.floor(sticksPerUnit || 1));
  const stickEquiv =
    countsAsSticks !== false && draftQty > 0 && per > 1
      ? `เทียบ ${draftQty * per} ไม้`
      : null;
  const minHint =
    minQty > 1 ? `ขั้นต่ำ ${minQty} ${unit}` : null;

  useEffect(() => {
    if (!editing) setQtyText(String(draftQty || 0));
  }, [draftQty, editing]);

  function commitQtyText(raw: string): number {
    const next = normalizeDraftQty(raw, minQty);
    onDraftChange(next);
    setQtyText(String(next));
    setEditing(false);
    return next;
  }

  function bump(delta: number) {
    const current = draftQty;
    if (delta > 0) {
      onDraftChange(current <= 0 ? minQty : current + delta);
      return;
    }
    onDraftChange(current <= minQty ? 0 : current + delta);
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100"
      >
        <IconBack size={18} />
        ย้อนกลับ
      </button>

      <div
        className={`relative w-full overflow-hidden rounded-2xl bg-site-primary-soft ${SKEWER_PHOTO_ASPECT_CLASS}`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <IconSkewerPlaceholder size={64} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-4 pb-4 pt-10">
          <p className="text-lg font-bold leading-snug text-white drop-shadow">
            {name}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 py-2">
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 text-2xl leading-none text-gray-700 disabled:opacity-40"
          disabled={draftQty <= 0}
          onClick={() => bump(-1)}
          aria-label="ลดจำนวน"
        >
          −
        </button>
        <div className="flex min-w-[5rem] flex-col items-center">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`จำนวน${unit}`}
            value={qtyText}
            onFocus={(e) => {
              setEditing(true);
              e.target.select();
            }}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "");
              setQtyText(next);
            }}
            onBlur={() => {
              commitQtyText(qtyText);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-full border-0 bg-transparent p-0 text-center text-3xl font-black tabular-nums text-gray-900 outline-none ring-0 focus:rounded-lg focus:ring-2 focus:ring-site-primary/40"
          />
          <span className="text-xs font-semibold text-gray-500">{unit}</span>
          {minHint ? (
            <span className="mt-0.5 text-[11px] font-medium text-amber-700">
              {minHint}
            </span>
          ) : null}
          {stickEquiv ? (
            <span className="mt-0.5 text-[11px] font-medium text-gray-400">
              {stickEquiv}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-site-primary text-2xl leading-none text-white"
          onClick={() => bump(1)}
          aria-label="เพิ่มจำนวน"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onConfirm(commitQtyText(qtyText))}
        className="w-full rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white"
      >
        ยืนยัน
      </button>
    </div>
  );
}

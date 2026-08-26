"use client";

import { IconBack, IconSkewerPlaceholder } from "@/components/icons";
import {
  SKEWER_MIN_QTY_PER_ITEM,
  SKEWER_PHOTO_ASPECT_CLASS,
} from "@/lib/skewer-order";

export function SkewerMenuItemQtyDetail({
  name,
  imageUrl,
  draftQty,
  onDraftChange,
  onBack,
  onConfirm,
}: {
  name: string;
  imageUrl: string | null;
  draftQty: number;
  onDraftChange: (next: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
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
          <p className="mt-0.5 text-xs text-white/80">
            ขั้นต่ำ {SKEWER_MIN_QTY_PER_ITEM} ไม้
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 py-2">
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 text-2xl leading-none text-gray-700 disabled:opacity-40"
          disabled={draftQty <= 0}
          onClick={() =>
            onDraftChange(
              draftQty <= SKEWER_MIN_QTY_PER_ITEM ? 0 : draftQty - 1,
            )
          }
          aria-label="ลดจำนวน"
        >
          −
        </button>
        <span className="min-w-[4rem] text-center text-3xl font-black tabular-nums text-gray-900">
          {draftQty || "0"}
        </span>
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-site-primary text-2xl leading-none text-white"
          onClick={() =>
            onDraftChange(
              draftQty < SKEWER_MIN_QTY_PER_ITEM
                ? SKEWER_MIN_QTY_PER_ITEM
                : draftQty + 1,
            )
          }
          aria-label="เพิ่มจำนวน"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="w-full rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white"
      >
        ยืนยัน
      </button>
    </div>
  );
}

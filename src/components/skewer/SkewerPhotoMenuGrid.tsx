"use client";

import { IconSkewerPlaceholder } from "@/components/icons";
import { SKEWER_PHOTO_ASPECT_CLASS } from "@/lib/skewer-order";

export type SkewerPhotoMenuItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  qtyUnit?: string | null;
};

/** Shared tile chrome for customer grid + admin previews. */
export function SkewerPhotoTileChrome({
  name,
  imageUrl,
  qty = 0,
  qtyUnit = "ไม้",
  className = "",
}: {
  name: string;
  imageUrl: string | null;
  /** Only shown when > 0 */
  qty?: number;
  qtyUnit?: string;
  className?: string;
}) {
  const showQty = typeof qty === "number" && qty > 0;
  const unit = qtyUnit.trim() || "ไม้";

  return (
    <div
      className={`relative overflow-hidden bg-site-primary-soft ${SKEWER_PHOTO_ASPECT_CLASS} ${className}`}
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
          <IconSkewerPlaceholder size={36} />
        </div>
      )}

      {showQty ? (
        <div
          className="absolute left-1/2 top-[40%] z-[1] flex aspect-square w-[62%] min-w-[5.25rem] max-w-[8.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-[3px] border-site-primary bg-white px-1.5 shadow-md"
          aria-label={`สั่งแล้ว ${qty} ${unit}`}
        >
          <span className="text-[11px] font-bold leading-none text-site-primary sm:text-xs">
            สั่งแล้ว
          </span>
          <span className="mt-1 text-[1.85rem] font-black tabular-nums leading-none text-site-primary sm:text-[2.15rem]">
            {qty}
          </span>
          <span className="mt-1 text-[11px] font-bold leading-none text-site-primary sm:text-xs">
            {unit}
          </span>
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-[1] bg-black/70 px-1.5 py-1">
        <p className="truncate text-left text-[11px] font-semibold leading-tight text-white">
          {name || "—"}
        </p>
      </div>
    </div>
  );
}

export function SkewerPhotoMenuGrid({
  items,
  qtys,
  onSelect,
}: {
  items: SkewerPhotoMenuItem[];
  qtys: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
        ไม่พบเมนู
      </p>
    );
  }

  return (
    <ul className="-mx-4 -mb-4 grid grid-cols-3 overflow-hidden rounded-b-2xl">
      {items.map((item) => {
        const qty = qtys[item.id] ?? 0;
        return (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              id={`skewer-menu-item-${item.id}`}
              onClick={() => onSelect(item.id)}
              className="block w-full scroll-mt-24 text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-site-primary"
            >
              <SkewerPhotoTileChrome
                name={item.name}
                imageUrl={item.imageUrl}
                qty={qty}
                qtyUnit={item.qtyUnit ?? undefined}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

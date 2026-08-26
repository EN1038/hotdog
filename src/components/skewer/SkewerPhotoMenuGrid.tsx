"use client";

import { IconSkewerPlaceholder } from "@/components/icons";

export type SkewerPhotoMenuItem = {
  id: string;
  name: string;
  imageUrl: string | null;
};

/** Shared tile chrome for customer grid + admin previews. */
export function SkewerPhotoTileChrome({
  name,
  imageUrl,
  qty = 0,
  className = "",
}: {
  name: string;
  imageUrl: string | null;
  /** Only shown when > 0 */
  qty?: number;
  className?: string;
}) {
  const showQty = typeof qty === "number" && qty > 0;

  return (
    <div
      className={`relative aspect-square overflow-hidden bg-neutral-900 ${className}`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-500">
          <IconSkewerPlaceholder size={36} />
        </div>
      )}

      {showQty ? (
        <p className="absolute inset-x-0 bottom-7 z-[1] text-center text-xl font-black tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          {qty}
        </p>
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
              onClick={() => onSelect(item.id)}
              className="block w-full text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-site-primary"
            >
              <SkewerPhotoTileChrome
                name={item.name}
                imageUrl={item.imageUrl}
                qty={qty}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

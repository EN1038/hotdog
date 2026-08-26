"use client";

import { IconSkewerPlaceholder } from "@/components/icons";

export type SkewerPhotoMenuItem = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export function SkewerPhotoMenuGrid({
  items,
  qtys,
  seqById,
  onSelect,
}: {
  items: SkewerPhotoMenuItem[];
  qtys: Record<string, number>;
  seqById: Map<string, number>;
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
    <ul className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const qty = qtys[item.id] ?? 0;
        const seq = seqById.get(item.id) ?? 0;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="flex w-full flex-col overflow-hidden rounded-xl bg-white text-left outline-none ring-site-primary focus-visible:ring-2"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-site-primary-soft">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <IconSkewerPlaceholder size={36} />
                  </div>
                )}
                <span className="absolute right-1 top-1 flex h-6 min-w-6 items-center justify-center rounded-md bg-black/70 px-1.5 text-xs font-bold tabular-nums text-white">
                  {seq}
                </span>
              </div>
              <div className="px-1 py-1.5 text-center">
                <p
                  className={`text-sm font-bold tabular-nums leading-none ${
                    qty > 0 ? "text-site-primary" : "text-gray-300"
                  }`}
                >
                  {qty > 0 ? qty : "—"}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

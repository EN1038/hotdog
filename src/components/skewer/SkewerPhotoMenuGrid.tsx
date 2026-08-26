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
    <ul className="-mx-4 -mb-4 grid grid-cols-3 overflow-hidden rounded-b-2xl">
      {items.map((item) => {
        const qty = qtys[item.id] ?? 0;
        const seq = seqById.get(item.id) ?? 0;
        return (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="relative block aspect-square w-full overflow-hidden bg-site-primary-soft text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-site-primary"
            >
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
              <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-md bg-black/30 px-1 text-[10px] font-medium tabular-nums text-white/90">
                {seq}
              </span>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-1.5 pb-1.5 pt-6">
                <p
                  className={`text-center text-base font-black tabular-nums leading-none drop-shadow ${
                    qty > 0 ? "text-white" : "text-white/55"
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

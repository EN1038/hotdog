"use client";

import { IconSkewerPlaceholder } from "@/components/icons";

export type StaffConsumableItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  imageUrl?: string | null;
};

function isBagItem(item: StaffConsumableItem) {
  return /ถุง/i.test(item.name);
}

export function findBagConsumables(items: StaffConsumableItem[]) {
  return items
    .filter(isBagItem)
    .slice()
    .sort((a, b) => {
      const rank = (name: string) =>
        /เล็ก/i.test(name) ? 0 : /ใหญ่/i.test(name) ? 1 : 2;
      const d = rank(a.name) - rank(b.name);
      return d !== 0 ? d : a.name.localeCompare(b.name, "th");
    });
}

/** @deprecated Prefer findBagConsumables — first bag only. */
export function findBagConsumable(items: StaffConsumableItem[]) {
  return findBagConsumables(items)[0] ?? null;
}

/** Non-bag items shown in the main list (cups, sauces, etc.). */
export function filterPrimaryConsumables(items: StaffConsumableItem[]) {
  return items.filter((i) => !isBagItem(i));
}

/** @deprecated Prefer filterPrimaryConsumables. */
export function filterCupConsumables(items: StaffConsumableItem[]) {
  const cups = items.filter((i) => /แก้ว/i.test(i.name));
  if (cups.length > 0) return cups;
  return filterPrimaryConsumables(items);
}

export function selectedConsumableTotal(
  items: StaffConsumableItem[],
  qtyByItemId: Record<string, number>,
) {
  return items.reduce(
    (s, i) => s + Math.max(0, qtyByItemId[i.id] ?? 0),
    0,
  );
}

/** Items that can still be picked (have stock). */
export function inStockConsumables(items: StaffConsumableItem[]) {
  return items.filter((i) => i.quantity > 0);
}

/** Require pick only when at least one key-order consumable still has stock. */
export function requiresConsumableSelection(items: StaffConsumableItem[]) {
  return inStockConsumables(items).length > 0;
}

function ConsumableRow({
  item,
  index,
  qty,
  onChangeQty,
}: {
  item: StaffConsumableItem;
  index?: number;
  qty: number;
  onChangeQty: (itemId: string, qty: number) => void;
}) {
  const soldOut = item.quantity <= 0;
  const max = Math.max(0, item.quantity);
  return (
    <li
      className={`flex items-center gap-2.5 px-3 py-2.5 ${
        soldOut ? "opacity-55" : ""
      }`}
    >
      {index != null ? (
        <span className="w-5 shrink-0 text-center text-xs font-semibold text-gray-400">
          {index}
        </span>
      ) : null}
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
          <IconSkewerPlaceholder className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">
          {item.name}{" "}
          <span className="font-medium text-red-500">
            ({item.unit || "ใบ"})
          </span>
        </p>
        <p className="text-[11px] text-gray-500">
          {soldOut ? "หมดสต๊อก" : `คงเหลือ ${item.quantity}`}
        </p>
      </div>
      <div
        className={`mr-1 flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-lg ${
          soldOut ? "bg-red-50" : "bg-slate-100"
        }`}
      >
        <span
          className={`text-base font-black tabular-nums ${
            soldOut ? "text-red-600" : "text-gray-900"
          }`}
        >
          {item.quantity}
        </span>
        <span
          className={`text-[9px] font-medium ${
            soldOut ? "text-red-500" : "text-gray-500"
          }`}
        >
          คงเหลือ
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="ลด"
          disabled={qty <= 0}
          onClick={() => onChangeQty(item.id, qty - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-700 disabled:opacity-40"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-bold tabular-nums">
          {qty}
        </span>
        <button
          type="button"
          aria-label="เพิ่ม"
          disabled={soldOut || qty >= max}
          onClick={() => onChangeQty(item.id, qty + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-site-primary text-lg font-bold text-white disabled:opacity-40"
        >
          +
        </button>
      </div>
    </li>
  );
}

export function StaffConsumablePicker({
  items,
  qtyByItemId,
  onChangeQty,
}: {
  items: StaffConsumableItem[];
  qtyByItemId: Record<string, number>;
  onChangeQty: (itemId: string, qty: number) => void;
}) {
  const primaryItems = filterPrimaryConsumables(items);
  const bagItems = findBagConsumables(items);

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">
          เลือกสินค้าสิ้นเปลือง
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          ยังไม่มีรายการที่เปิดให้เลือก — ไปที่หลังบ้าน Admin → สต๊อกสาขา →
          ของสิ้นเปลือง แล้วเปิด “แสดงตอนคีย์ออเดอร์พนักงาน”
        </p>
      </section>
    );
  }

  return (
    <section
      id="staff-consumables"
      tabIndex={-1}
      className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/50 p-4 outline-none"
    >
      <div>
        <h2 className="text-sm font-semibold text-gray-900">
          เลือกสินค้าสิ้นเปลือง
        </h2>
        <p className="mt-0.5 text-xs text-gray-600">
          เลือกแก้ว/ของสิ้นเปลืองที่ใช้จริง — ตัดสต๊อกเมื่อบันทึก
          {bagItems.length > 0 && bagItems.every((i) => i.quantity <= 0)
            ? " · ถุงหมดสต๊อก เลือกแค่แก้วได้"
            : bagItems.length > 0
              ? " · เลือกขนาดถุงที่ใช้กับออเดอร์นี้"
              : ""}
          {primaryItems.every((i) => i.quantity <= 0) &&
          bagItems.every((i) => i.quantity <= 0)
            ? " · ของสิ้นเปลืองหมดครบ บันทึกออเดอร์ได้โดยไม่ต้องเลือก"
            : ""}
        </p>
      </div>

      {primaryItems.length > 0 ? (
        <ul className="divide-y divide-sky-100 overflow-hidden rounded-xl border border-sky-100 bg-white">
          {primaryItems.map((item, index) => (
            <ConsumableRow
              key={item.id}
              item={item}
              index={index + 1}
              qty={qtyByItemId[item.id] ?? 0}
              onChangeQty={onChangeQty}
            />
          ))}
        </ul>
      ) : null}

      {bagItems.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            เลือกถุง
          </h3>
          <ul className="divide-y divide-sky-100 overflow-hidden rounded-xl border border-sky-100 bg-white">
            {bagItems.map((item) => (
              <ConsumableRow
                key={item.id}
                item={item}
                qty={qtyByItemId[item.id] ?? 0}
                onChangeQty={onChangeQty}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconImage } from "@/components/icons";
import { formatPrice } from "@/lib/constants";
import type {
  ShopDailyPoint,
  ShopHourlyPoint,
  ShopTopSeller,
  ShopWeekdayPoint,
} from "@/lib/shop-overview-metrics";
import type {
  SalesReportCancelReason,
  SalesReportWasteEntry,
  SalesReportWasteItem,
} from "@/lib/sales-report-shared";
import type { ShopAgingAttention } from "@/lib/shop-aging-summary";

function wasteTypeLabel(type: string) {
  if (type === "DAMAGE") return "ชำรุด";
  if (type === "LOST") return "สูญหาย";
  if (type === "ISSUE") return "จ่ายออกจากสต๊อก";
  return type;
}

function formatWasteAt(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function itemMetaLine(item: SalesReportWasteItem): string {
  const entries = item.entries ?? [];
  const times = entries.length;
  const types = [
    ...new Set(entries.map((e) => wasteTypeLabel(e.type))),
  ];
  const typeText = types.length > 0 ? types.join(" · ") : "ของเสีย";
  if (times <= 1) {
    const entry = entries[0];
    if (!entry) return typeText;
    return [
      formatWasteAt(entry.createdAt),
      entry.createdByName || null,
      wasteTypeLabel(entry.type),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return `${formatPrice(times)} ครั้ง · ${typeText}`;
}

/** ไอคอนรูปข้างเหตุผล — กดแล้วเปิดดูเต็มจอ */
function WastePhotoButton({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="ดูรูปของเสีย"
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="รูปประกอบของเสีย"
              className="max-h-[90dvh] max-w-[min(100%,42rem)] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/95 px-3 py-1.5 text-sm font-bold text-slate-800 shadow"
            >
              ปิด
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 active:scale-95"
        aria-label="ดูรูปของเสีย"
        title="ดูรูป"
      >
        <IconImage size={18} />
      </button>
      {overlay}
    </>
  );
}

function WasteEntryReasonBlock({ entry }: { entry: SalesReportWasteEntry }) {
  const note = entry.note?.trim() || null;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg bg-white px-2.5 py-2">
      <div className="min-w-0 flex-1">
        {note ? (
          <p className="text-[13px] font-medium text-slate-800">
            <span className="font-semibold text-amber-800">เหตุผล: </span>
            {note}
          </p>
        ) : (
          <p className="text-[12px] font-medium text-slate-400">ไม่ระบุเหตุผล</p>
        )}
      </div>
      {entry.imageUrl ? <WastePhotoButton src={entry.imageUrl} /> : null}
    </div>
  );
}

/** สวิตช์เปิด/ปิดแสดงรายละเอียด — แบบเดียวกับสัดส่วนการขาย */
function OverviewShowSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        checked ? "bg-site-primary" : "bg-slate-300"
      }`}
    >
      <span
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
        style={{ left: checked ? "1.65rem" : "0.2rem" }}
      />
    </button>
  );
}

/** ตัวเลขบนแท่งกราฟ — ย่อเมื่อวันเยอะเพื่อไม่ทับกัน */
function formatBarAmount(n: number, compact: boolean): string {
  if (n <= 0) return "0";
  if (!compact) return formatPrice(n);
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) {
    const k = n / 1000;
    return `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(Math.round(n));
}

export function ShopDailyRevenueBars({
  days,
  loading,
  defaultOpen = false,
}: {
  days: ShopDailyPoint[];
  loading?: boolean;
  defaultOpen?: boolean;
}) {
  const [show, setShow] = useState(defaultOpen);
  const maxRevenue = Math.max(1, ...days.map((d) => d.revenueBaht));
  const total = days.reduce((a, d) => a + d.revenueBaht, 0);
  const compact = days.length > 7;

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            ยอดขายรายวัน
          </h2>
          {!show ? (
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-500">
              รวม {formatPrice(total)} ฿
            </p>
          ) : null}
        </div>
        <OverviewShowSwitch
          checked={show}
          onChange={setShow}
          label="แสดงยอดขายรายวัน"
        />
      </div>
      {!show ? null : days.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>
      ) : (
        <>
          <p className="mb-2 text-right text-[12px] font-semibold tabular-nums text-slate-500">
            รวม {formatPrice(total)} ฿
          </p>
          <div className="flex h-44 items-end gap-1 overflow-x-auto pb-1">
            {days.map((d) => (
              <div
                key={d.date}
                className="flex min-w-[2rem] flex-1 flex-col items-center justify-end gap-1"
                title={`${d.label}: ${formatPrice(d.revenueBaht)} ฿ · ${d.orderCount} บิล`}
              >
                <span className="max-w-full truncate text-center text-[9px] font-bold tabular-nums leading-none text-slate-700">
                  {formatBarAmount(d.revenueBaht, compact)}
                </span>
                <div className="flex h-28 w-full items-end justify-center">
                  <div
                    className="w-[70%] max-w-[1.25rem] rounded-t-md bg-emerald-500"
                    style={{
                      height: `${Math.max(
                        d.revenueBaht > 0 ? 6 : 2,
                        (d.revenueBaht / maxRevenue) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="max-w-full truncate text-[9px] font-medium text-slate-500">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function ShopTopSellersList({
  items,
  loading,
  defaultOpen = false,
  href,
  title = "สินค้าขายดี Top 10",
  linkLabel = "เปิดหน้าวิเคราะห์เต็ม →",
}: {
  items: ShopTopSeller[];
  loading?: boolean;
  defaultOpen?: boolean;
  href?: string;
  title?: string;
  linkLabel?: string;
}) {
  const [show, setShow] = useState(defaultOpen);

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            {title}
          </h2>
          {href ? (
            <Link
              href={href}
              className="mt-0.5 inline-block text-[12px] font-bold text-emerald-700"
            >
              {linkLabel}
            </Link>
          ) : null}
        </div>
        <OverviewShowSwitch
          checked={show}
          onChange={setShow}
          label={`แสดง${title}`}
        />
      </div>
      {!show ? null : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          ยังไม่มียอดขายในช่วงนี้
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <li
              key={`${item.name}-${index}`}
              className="flex items-center gap-3 py-2.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-black tabular-nums text-slate-700">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-slate-900">
                  {item.name}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  {formatPrice(item.quantity)} ชิ้น
                </p>
              </div>
              <p className="shrink-0 text-[14px] font-extrabold tabular-nums text-slate-900">
                {formatPrice(item.revenueBaht)} ฿
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** รายการของเสียทั้งหมดในช่วงที่เลือก — รวมสินค้าเดียวกันเป็นแถวเดียว */
export function ShopWasteSummaryList({
  items,
  wasteQty,
  wasteValue,
  loading,
  defaultOpen = false,
}: {
  items: SalesReportWasteItem[];
  wasteQty?: number;
  wasteValue?: number;
  loading?: boolean;
  defaultOpen?: boolean;
}) {
  const [show, setShow] = useState(defaultOpen);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const qty =
    wasteQty ?? items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const value =
    wasteValue ?? items.reduce((sum, item) => sum + (item.value ?? 0), 0);

  return (
    <section
      className={`rounded-2xl border border-amber-200/80 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            ของเสียทั้งหมด
          </h2>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
            {show
              ? "รวมตามสินค้า · กดดูเหตุผล"
              : `${formatPrice(qty)} ชิ้น · ฿${formatPrice(value)}`}
          </p>
        </div>
        <OverviewShowSwitch
          checked={show}
          onChange={setShow}
          label="แสดงของเสียทั้งหมด"
        />
      </div>

      {!show ? null : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          ไม่มีรายการของเสียในช่วงนี้
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const entries = item.entries ?? [];
            const open = expandedId === item.menuItemId;
            const single = entries.length <= 1;
            const hasPhoto = entries.some((e) => e.imageUrl);

            return (
              <li
                key={item.menuItemId}
                className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((id) =>
                      id === item.menuItemId ? null : item.menuItemId,
                    )
                  }
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-slate-900">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {itemMetaLine(item)}
                      {hasPhoto ? " · มีรูป" : ""}
                      {entries.length > 1 ? (open ? " · ซ่อน" : " · กดดู") : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-extrabold tabular-nums text-amber-900">
                      {formatPrice(item.quantity)}
                    </p>
                    <p className="text-[11px] font-semibold tabular-nums text-slate-500">
                      ฿{formatPrice(item.value)}
                    </p>
                  </div>
                </button>

                {single && entries[0] ? (
                  <WasteEntryReasonBlock entry={entries[0]} />
                ) : open ? (
                  <ul className="mt-2 space-y-2">
                    {entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-lg bg-white px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-medium text-slate-500">
                            {formatWasteAt(entry.createdAt)}
                            {entry.createdByName
                              ? ` · ${entry.createdByName}`
                              : ""}
                            {" · "}
                            {wasteTypeLabel(entry.type)}
                            {entry.imageUrl ? " · มีรูป" : ""}
                          </p>
                          <p className="shrink-0 text-[12px] font-bold tabular-nums text-amber-900">
                            {formatPrice(entry.quantity)} · ฿
                            {formatPrice(entry.value)}
                          </p>
                        </div>
                        <WasteEntryReasonBlock entry={entry} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[13px] font-medium text-slate-600">
                    รวม {formatPrice(entries.length)} ครั้ง
                    {hasPhoto ? " · มีรูป" : ""} · กดเพื่อดูเหตุผล
                    {hasPhoto ? "และรูป" : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ShopHourlyRevenueBars({
  hours,
  loading,
  defaultOpen = false,
}: {
  hours: ShopHourlyPoint[];
  loading?: boolean;
  defaultOpen?: boolean;
}) {
  const [show, setShow] = useState(defaultOpen);
  const active = hours.filter((h) => h.orderCount > 0 || h.revenueBaht > 0);
  const display = active.length > 0 ? active : hours;
  const maxRevenue = Math.max(1, ...display.map((h) => h.revenueBaht));
  const total = hours.reduce((a, h) => a + h.revenueBaht, 0);
  const peak = [...hours].sort(
    (a, b) => b.revenueBaht - a.revenueBaht || b.orderCount - a.orderCount,
  )[0];

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            ยอดขายรายชั่วโมง
          </h2>
          {!show ? (
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-500">
              รวม {formatPrice(total)} ฿
              {peak && peak.revenueBaht > 0
                ? ` · พีก ${peak.label}:00`
                : ""}
            </p>
          ) : null}
        </div>
        <OverviewShowSwitch
          checked={show}
          onChange={setShow}
          label="แสดงยอดขายรายชั่วโมง"
        />
      </div>
      {!show ? null : display.every((h) => h.revenueBaht <= 0) ? (
        <p className="py-6 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>
      ) : (
        <>
          <p className="mb-2 text-right text-[12px] font-semibold tabular-nums text-slate-500">
            รวม {formatPrice(total)} ฿
            {peak && peak.revenueBaht > 0
              ? ` · พีก ${peak.label}:00 · ${formatPrice(peak.revenueBaht)} ฿`
              : ""}
          </p>
          <div className="flex h-40 items-end gap-0.5 overflow-x-auto pb-1">
            {display.map((h) => (
              <div
                key={h.hour}
                className="flex min-w-[1.35rem] flex-1 flex-col items-center justify-end gap-1"
                title={`${h.label}:00 · ${formatPrice(h.revenueBaht)} ฿ · ${h.orderCount} บิล`}
              >
                <span className="max-w-full truncate text-center text-[8px] font-bold tabular-nums leading-none text-slate-700">
                  {h.revenueBaht > 0
                    ? formatBarAmount(h.revenueBaht, true)
                    : ""}
                </span>
                <div className="flex h-24 w-full items-end justify-center">
                  <div
                    className="w-[75%] max-w-[0.85rem] rounded-t-md bg-teal-500"
                    style={{
                      height: `${Math.max(
                        h.revenueBaht > 0 ? 6 : 2,
                        (h.revenueBaht / maxRevenue) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="max-w-full truncate text-[8px] font-medium text-slate-500">
                  {h.label}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function ShopWeekdayRevenueBars({
  weekdays,
  loading,
  defaultOpen = true,
}: {
  weekdays: ShopWeekdayPoint[];
  loading?: boolean;
  defaultOpen?: boolean;
}) {
  const [show, setShow] = useState(defaultOpen);
  const maxRevenue = Math.max(1, ...weekdays.map((d) => d.revenueBaht));
  const total = weekdays.reduce((a, d) => a + d.revenueBaht, 0);
  const peak = [...weekdays].sort(
    (a, b) => b.revenueBaht - a.revenueBaht || b.orderCount - a.orderCount,
  )[0];

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            ยอดขายแยกวันในสัปดาห์
          </h2>
          {!show ? (
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-500">
              รวม {formatPrice(total)} ฿
              {peak && peak.revenueBaht > 0 ? ` · พีกวัน${peak.label}` : ""}
            </p>
          ) : null}
        </div>
        <OverviewShowSwitch
          checked={show}
          onChange={setShow}
          label="แสดงยอดขายแยกวันในสัปดาห์"
        />
      </div>
      {!show ? null : weekdays.every((d) => d.revenueBaht <= 0) ? (
        <p className="py-6 text-center text-sm text-slate-400">ไม่มีข้อมูล</p>
      ) : (
        <>
          <p className="mb-2 text-right text-[12px] font-semibold tabular-nums text-slate-500">
            รวม {formatPrice(total)} ฿
            {peak && peak.revenueBaht > 0
              ? ` · พีกวัน${peak.label} · ${formatPrice(peak.revenueBaht)} ฿`
              : ""}
          </p>
          <div className="flex h-44 items-end gap-1.5 pb-1">
            {weekdays.map((d) => (
              <div
                key={d.weekday}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                title={`วัน${d.label}: ${formatPrice(d.revenueBaht)} ฿ · ${d.orderCount} บิล`}
              >
                <span className="max-w-full truncate text-center text-[9px] font-bold tabular-nums leading-none text-slate-700">
                  {d.revenueBaht > 0 ? formatBarAmount(d.revenueBaht, true) : ""}
                </span>
                <div className="flex h-28 w-full items-end justify-center">
                  <div
                    className="w-[70%] max-w-[1.5rem] rounded-t-md bg-emerald-500"
                    style={{
                      height: `${Math.max(
                        d.revenueBaht > 0 ? 6 : 2,
                        (d.revenueBaht / maxRevenue) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-600">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function ShopCancelSummary({
  cancelledCount,
  cancelledRevenue,
  reasons,
  loading,
  defaultOpen = true,
}: {
  cancelledCount: number;
  cancelledRevenue: number;
  reasons: SalesReportCancelReason[];
  loading?: boolean;
  defaultOpen?: boolean;
}) {
  const [show, setShow] = useState(defaultOpen);

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            บิลที่ยกเลิก
          </h2>
          <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-500">
            {formatPrice(cancelledCount)} บิล · ฿
            {formatPrice(cancelledRevenue)}
          </p>
        </div>
        <OverviewShowSwitch
          checked={show}
          onChange={setShow}
          label="แสดงเหตุผลยกเลิก"
        />
      </div>
      {!show ? null : cancelledCount <= 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          ไม่มีบิลยกเลิกในช่วงนี้
        </p>
      ) : reasons.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          มีการยกเลิก แต่ยังไม่ระบุเหตุผล
        </p>
      ) : (
        <ul className="space-y-2">
          {reasons.map((row) => (
            <li
              key={row.reason}
              className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
            >
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">
                {row.reason}
              </p>
              <p className="shrink-0 text-[13px] font-extrabold tabular-nums text-slate-700">
                {formatPrice(row.count)} บิล
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ShopAgingAttentionCard({
  aging,
  loading,
  href,
}: {
  aging: ShopAgingAttention | null | undefined;
  loading?: boolean;
  href?: string;
}) {
  if (!aging?.stockActive) return null;

  const body = (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
        loading ? "opacity-60" : ""
      }`}
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-extrabold text-slate-900">
          สต๊อกค้างอายุ
        </h2>
        <p className="mt-0.5 text-[12px] font-medium text-slate-500">
          แดง ≥{aging.criticalDays} วัน · ส้ม ≥{aging.warnDays} วัน
          {aging.attentionCount > 0
            ? ` · ต้องดู ${aging.attentionCount} รายการ`
            : " · ปกติ"}
        </p>
      </div>
      <div className="grid grid-cols-2">
        <div className="border-r border-slate-100 bg-rose-50 px-4 py-3">
          <p className="text-[12px] font-bold text-rose-800">แดง</p>
          <p className="mt-1 text-[20px] font-black tabular-nums text-rose-900">
            {formatPrice(aging.criticalQty)}
            <span className="ml-1 text-[12px] font-bold">ชิ้น</span>
          </p>
          <p className="mt-1 text-[11px] font-semibold text-rose-700">
            {aging.critical} รายการ · ฿{formatPrice(aging.criticalValueBaht)}
          </p>
        </div>
        <div className="bg-amber-50/90 px-4 py-3">
          <p className="text-[12px] font-bold text-amber-900/85">ส้ม</p>
          <p className="mt-1 text-[20px] font-black tabular-nums text-amber-950/80">
            {formatPrice(aging.warnQty)}
            <span className="ml-1 text-[12px] font-bold">ชิ้น</span>
          </p>
          <p className="mt-1 text-[11px] font-semibold text-amber-800/75">
            {aging.warn} รายการ · ฿{formatPrice(aging.warnValueBaht)}
          </p>
        </div>
      </div>
      {href ? (
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-right text-[13px] font-extrabold text-slate-500">
          ดูรายการ →
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block active:scale-[0.99]">
        {body}
      </Link>
    );
  }
  return body;
}

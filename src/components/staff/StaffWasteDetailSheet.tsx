"use client";

import { useEffect, useState } from "react";
import { ZoomableImage } from "@/components/ZoomableImage";
import { formatPrice } from "@/lib/constants";
import type {
  SalesReportWasteEntry,
  SalesReportWasteItem,
} from "@/lib/sales-report-shared";

type Props = {
  open: boolean;
  onClose: () => void;
  rangeLabel: string;
  wasteQty: number;
  wasteValue: number;
  items: SalesReportWasteItem[];
};

function formatDateTime(iso: string) {
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

function wasteTypeLabel(type: string) {
  if (type === "DAMAGE") return "ชำรุด";
  if (type === "LOST") return "สูญหาย";
  if (type === "ISSUE") return "จ่ายออกจากสต๊อก";
  return type;
}

function EntryCard({ entry }: { entry: SalesReportWasteEntry }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-500">
            {formatDateTime(entry.createdAt)}
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-slate-600">
            {entry.createdByName ?? "ไม่ระบุผู้บันทึก"} ·{" "}
            {wasteTypeLabel(entry.type)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black tabular-nums text-orange-800">
            {formatPrice(entry.quantity)}
          </p>
          <p className="text-[11px] font-medium tabular-nums text-slate-500">
            ฿{formatPrice(entry.value)}
          </p>
        </div>
      </div>
      {entry.note ? (
        <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[13px] font-medium text-slate-800">
          {entry.note}
        </p>
      ) : (
        <p className="mt-2 text-[12px] font-medium text-slate-400">
          ไม่มีรายละเอียดบันทึก
        </p>
      )}
      {entry.imageUrl ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ZoomableImage
            src={entry.imageUrl}
            alt="รูปประกอบของเสีย"
            className="max-h-56 w-full object-cover"
          />
        </div>
      ) : (
        <p className="mt-2 text-[12px] font-medium text-slate-400">ไม่มีรูปแนบ</p>
      )}
    </li>
  );
}

export function StaffWasteDetailSheet({
  open,
  onClose,
  rangeLabel,
  wasteQty,
  wasteValue,
  items,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  if (!open) return null;

  const selected =
    items.find((item) => item.menuItemId === selectedId) ?? null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="รายละเอียดของเสีย"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3">
          <div className="min-w-0">
            {selected ? (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mb-0.5 text-left text-[12px] font-semibold text-orange-700"
              >
                ← กลับรายการของเสีย
              </button>
            ) : null}
            <p className="truncate text-base font-bold text-orange-900">
              {selected ? selected.name : "ของเสีย"}
            </p>
            <p className="truncate text-xs font-medium text-orange-700/80">
              {selected
                ? `${formatPrice(selected.quantity)} ชิ้น · ฿${formatPrice(selected.value)}`
                : rangeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            ปิด
          </button>
        </div>

        {!selected ? (
          <div className="grid grid-cols-2 gap-2 border-b border-orange-50 bg-orange-50/60 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold text-orange-700">จำนวน</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-orange-900">
                {formatPrice(wasteQty)}{" "}
                <span className="text-sm font-bold">ชิ้น</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-orange-700">มูลค่า</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-orange-900">
                ฿{formatPrice(wasteValue)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {selected ? (
            (selected.entries ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm font-medium text-slate-500">
                ไม่มีรายละเอียดบันทึก
              </p>
            ) : (
              <ul className="space-y-3 pb-2">
                {(selected.entries ?? []).map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </ul>
            )
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm font-medium text-slate-500">
              ไม่มีรายการของเสียในช่วงนี้
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const entries = item.entries ?? [];
                const hasPhoto = entries.some((e) => e.imageUrl);
                const hasNote = entries.some((e) => e.note);
                return (
                  <li key={item.menuItemId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.menuItemId)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                          {entries.length} ครั้งบันทึก
                          {hasPhoto ? " · มีรูป" : ""}
                          {hasNote ? " · มีรายละเอียด" : ""}
                          {" · กดดู"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black tabular-nums text-orange-800">
                          {formatPrice(item.quantity)}
                        </p>
                        <p className="text-[11px] font-medium tabular-nums text-slate-500">
                          ฿{formatPrice(item.value)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useId } from "react";
import { formatPrice } from "@/lib/constants";

export type StaffOrderSummaryLine = {
  id: string;
  name: string;
  quantity: number;
  /** Unit sell price (before options) */
  unitPrice: number;
  /** Options add-on per unit */
  optionsPrice: number;
  optionNote?: string;
};

export function StaffOrderSummary({
  lines,
  deliveryFee = 0,
}: {
  lines: StaffOrderSummaryLine[];
  deliveryFee?: number;
}) {
  const itemsTotal = lines.reduce(
    (sum, line) =>
      sum + (line.unitPrice + line.optionsPrice) * line.quantity,
    0,
  );
  const total = itemsTotal + Math.max(0, deliveryFee);
  const pieceCount = lines.reduce((n, l) => n + l.quantity, 0);

  if (lines.length === 0) {
    return (
      <section
        id="staff-order-summary"
        className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-4"
      >
        <h2 className="text-sm font-semibold text-gray-900">สรุปรายการ</h2>
        <p className="mt-1 text-xs text-gray-500">ยังไม่ได้เลือกเมนู</p>
      </section>
    );
  }

  return (
    <section
      id="staff-order-summary"
      className="rounded-2xl border border-gray-200 bg-white p-4"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">สรุปรายการ</h2>
        <p className="text-xs text-gray-500">{pieceCount} ชิ้น</p>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => {
          const lineTotal =
            (line.unitPrice + line.optionsPrice) * line.quantity;
          return (
            <li
              key={line.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">
                  {line.name}{" "}
                  <span className="font-normal text-gray-500">
                    ×{line.quantity}
                  </span>
                </p>
                {line.optionNote ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                    {line.optionNote}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 tabular-nums text-gray-900">
                {formatPrice(lineTotal)}฿
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>ค่าอาหาร</span>
          <span className="tabular-nums">{formatPrice(itemsTotal)}฿</span>
        </div>
        {deliveryFee > 0 ? (
          <div className="flex justify-between text-gray-600">
            <span>ค่าส่ง</span>
            <span className="tabular-nums">{formatPrice(deliveryFee)}฿</span>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-bold text-gray-900">
          <span>ยอดรวม</span>
          <span className="tabular-nums text-site-primary">
            {formatPrice(total)}฿
          </span>
        </div>
      </div>
    </section>
  );
}

export function StaffKeyOrderAlertModal({
  open,
  title = "กรอกข้อมูลไม่ครบ",
  message,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-bold text-gray-900">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-site-primary px-4 py-3 text-sm font-bold text-white"
        >
          ตกลง
        </button>
      </div>
    </div>
  );
}

/** Scroll to a field and briefly focus it for validation UX. */
export function scrollToStaffAnchor(anchorId: string) {
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLElement) {
    el.focus({ preventScroll: true });
  }
}

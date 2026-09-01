"use client";

import { useId } from "react";
import { formatPrice } from "@/lib/constants";
import {
  ORDER_DISCOUNT_REASONS,
  type OrderDiscountReasonId,
  roundDiscountBaht,
} from "@/lib/order-discount";

export type StaffOrderDiscountState = {
  discountAmount: number;
  discountReason: OrderDiscountReasonId | "";
  discountReasonNote: string;
};

export function StaffOrderDiscountSection({
  itemsSubtotal,
  deliveryFee = 0,
  value,
  onChange,
  disabled = false,
}: {
  itemsSubtotal: number;
  deliveryFee?: number;
  value: StaffOrderDiscountState;
  onChange: (next: StaffOrderDiscountState) => void;
  disabled?: boolean;
}) {
  const preTotal = Math.max(0, itemsSubtotal + deliveryFee);
  const amountId = useId();
  const reasonId = useId();

  const parsedAmount = roundDiscountBaht(Number(value.discountAmount) || 0);
  const showReason = parsedAmount > 0;

  return (
    <section
      id="staff-order-discount"
      className="rounded-2xl border border-gray-200 bg-white p-4"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">ส่วนลดท้ายบิล</h2>
        <p className="text-xs text-gray-500">
          ก่อนลด {formatPrice(preTotal)}฿
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor={amountId} className="text-xs font-medium text-gray-600">
            จำนวนส่วนลด (บาท)
          </label>
          <input
            id={amountId}
            type="number"
            min={0}
            max={preTotal}
            step={1}
            inputMode="decimal"
            disabled={disabled || preTotal <= 0}
            value={value.discountAmount > 0 ? value.discountAmount : ""}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.trim();
              const nextAmount = raw === "" ? 0 : roundDiscountBaht(Number(raw));
              onChange({
                ...value,
                discountAmount: nextAmount,
                discountReason:
                  nextAmount <= 0 ? "" : value.discountReason,
                discountReasonNote:
                  nextAmount <= 0 ? "" : value.discountReasonNote,
              });
            }}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-site-primary"
          />
        </div>

        {showReason ? (
          <>
            <div>
              <label htmlFor={reasonId} className="text-xs font-medium text-gray-600">
                เหตุผล <span className="text-red-500">*</span>
              </label>
              <select
                id={reasonId}
                disabled={disabled}
                value={value.discountReason}
                onChange={(e) =>
                  onChange({
                    ...value,
                    discountReason: e.target.value as OrderDiscountReasonId | "",
                    discountReasonNote:
                      e.target.value === "other" ? value.discountReasonNote : "",
                  })
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-site-primary"
              >
                <option value="">— เลือกเหตุผล —</option>
                {ORDER_DISCOUNT_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {value.discountReason === "other" ? (
              <div>
                <label className="text-xs font-medium text-gray-600">
                  ระบุเหตุผล <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={120}
                  disabled={disabled}
                  value={value.discountReasonNote}
                  onChange={(e) =>
                    onChange({ ...value, discountReasonNote: e.target.value })
                  }
                  placeholder="เช่น ลูกค้า VIP"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-site-primary"
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-gray-500">
            ใช้เมื่อยอดรวมรายการยังไม่ตรงที่ตกลง (โปรปน · ต่อรอง · ของค้าง)
          </p>
        )}
      </div>
    </section>
  );
}

/** Compact discount fields for admin skewer panel */
export function AdminOrderDiscountFields({
  itemsSubtotal,
  shippingCostBaht = 0,
  value,
  onChange,
  disabled = false,
}: {
  itemsSubtotal: number;
  shippingCostBaht?: number;
  value: StaffOrderDiscountState;
  onChange: (next: StaffOrderDiscountState) => void;
  disabled?: boolean;
}) {
  const preTotal = Math.max(0, itemsSubtotal + shippingCostBaht);
  const amountId = useId();
  const reasonId = useId();
  const parsedAmount = roundDiscountBaht(Number(value.discountAmount) || 0);

  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3">
      <p className="text-xs font-semibold text-gray-700">ส่วนลดท้ายบิล</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={amountId} className="text-xs text-gray-600">
            ส่วนลด (บาท)
          </label>
          <input
            id={amountId}
            type="number"
            min={0}
            max={preTotal}
            step={1}
            disabled={disabled || preTotal <= 0}
            value={value.discountAmount > 0 ? value.discountAmount : ""}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.trim();
              const nextAmount = raw === "" ? 0 : roundDiscountBaht(Number(raw));
              onChange({
                ...value,
                discountAmount: nextAmount,
                discountReason: nextAmount <= 0 ? "" : value.discountReason,
                discountReasonNote:
                  nextAmount <= 0 ? "" : value.discountReasonNote,
              });
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums"
          />
        </div>
        {parsedAmount > 0 ? (
          <div>
            <label htmlFor={reasonId} className="text-xs text-gray-600">
              เหตุผล
            </label>
            <select
              id={reasonId}
              disabled={disabled}
              value={value.discountReason}
              onChange={(e) =>
                onChange({
                  ...value,
                  discountReason: e.target.value as OrderDiscountReasonId | "",
                })
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
            >
              <option value="">— เลือก —</option>
              {ORDER_DISCOUNT_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {parsedAmount > 0 && value.discountReason === "other" ? (
        <input
          type="text"
          maxLength={120}
          disabled={disabled}
          value={value.discountReasonNote}
          onChange={(e) =>
            onChange({ ...value, discountReasonNote: e.target.value })
          }
          placeholder="ระบุเหตุผล"
          className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
        />
      ) : null}
    </div>
  );
}

export function emptyStaffOrderDiscountState(): StaffOrderDiscountState {
  return {
    discountAmount: 0,
    discountReason: "",
    discountReasonNote: "",
  };
}

export function staffOrderDiscountPayload(value: StaffOrderDiscountState) {
  return {
    discountAmount: roundDiscountBaht(value.discountAmount),
    discountReason: value.discountReason || undefined,
    discountReasonNote:
      value.discountReason === "other"
        ? value.discountReasonNote.trim() || undefined
        : undefined,
  };
}

export function validateStaffOrderDiscountClient(
  itemsSubtotal: number,
  deliveryFee: number,
  value: StaffOrderDiscountState,
): string | null {
  const amount = roundDiscountBaht(value.discountAmount);
  if (amount <= 0) return null;
  if (!value.discountReason) return "กรุณาเลือกเหตุผลส่วนลด";
  if (amount > itemsSubtotal + deliveryFee) {
    return "ส่วนลดต้องไม่เกินยอดก่อนหัก";
  }
  if (
    value.discountReason === "other" &&
    value.discountReasonNote.trim().length < 2
  ) {
    return "กรุณาระบุเหตุผลส่วนลด";
  }
  return null;
}

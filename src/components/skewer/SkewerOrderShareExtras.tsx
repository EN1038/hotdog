"use client";

import { formatPrice } from "@/lib/constants";

function formatShareDate(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

export type SkewerOrderShareExtrasProps = {
  itemsSubtotalBaht?: number | null;
  shippingCostBaht?: number | null;
  grandTotalBaht?: number | null;
  deliveredOn?: string | null;
  deliveryInfo?: string | null;
  adminNote?: string | null;
  showBilling?: boolean;
  className?: string;
};

export function SkewerOrderShareExtras({
  itemsSubtotalBaht,
  shippingCostBaht,
  grandTotalBaht,
  deliveredOn,
  deliveryInfo,
  adminNote,
  showBilling = true,
  className = "",
}: SkewerOrderShareExtrasProps) {
  const hasBilling =
    showBilling &&
    ((itemsSubtotalBaht != null && itemsSubtotalBaht > 0) ||
      (shippingCostBaht != null && shippingCostBaht > 0) ||
      (grandTotalBaht != null && grandTotalBaht > 0));

  const hasDelivery = Boolean(deliveredOn?.trim() || deliveryInfo?.trim());
  const hasAdminNote = Boolean(adminNote?.trim());

  if (!hasBilling && !hasDelivery && !hasAdminNote) return null;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {hasBilling && itemsSubtotalBaht != null ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-sm">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-violet-800/80">
            สรุปยอด
          </p>
          <div className="space-y-1 text-gray-800">
            <p className="flex justify-between gap-3">
              <span>รวมสินค้า</span>
              <span className="font-semibold tabular-nums">
                {formatPrice(itemsSubtotalBaht)} บาท
              </span>
            </p>
            {shippingCostBaht != null && shippingCostBaht > 0 ? (
              <p className="flex justify-between gap-3">
                <span>ค่าส่ง</span>
                <span className="font-semibold tabular-nums">
                  {formatPrice(shippingCostBaht)} บาท
                </span>
              </p>
            ) : null}
            {grandTotalBaht != null ? (
              <p className="flex justify-between gap-3 border-t border-violet-200/80 pt-1.5 font-semibold text-violet-950">
                <span>รวมทั้งสิ้น</span>
                <span className="text-base font-black tabular-nums">
                  {formatPrice(grandTotalBaht)} บาท
                </span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasDelivery ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2.5 text-sm text-gray-800">
          {deliveredOn?.trim() ? (
            <p>
              <span className="font-semibold text-sky-900">
                วันที่ส่งสำเร็จ:{" "}
              </span>
              {formatShareDate(deliveredOn.trim())}
            </p>
          ) : null}
          {deliveryInfo?.trim() ? (
            <p className={`whitespace-pre-wrap ${deliveredOn ? "mt-1" : ""}`}>
              <span className="font-semibold text-sky-900">การส่ง: </span>
              {deliveryInfo.trim()}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasAdminNote ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          โน้ตร้าน: {adminNote!.trim()}
        </p>
      ) : null}
    </div>
  );
}

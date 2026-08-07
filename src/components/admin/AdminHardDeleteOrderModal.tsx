"use client";

import { useEffect, useId, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import {
  adminInputClass,
  adminLabelClass,
  btnOutline,
} from "@/components/admin/AdminShell";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatQueueNumber } from "@/lib/order-queue-format";

export type HardDeleteOrderTarget = {
  id: string;
  orderNumber: string;
  queueNumber?: number | null;
  status: OrderStatus;
};

type Props = {
  open: boolean;
  branchId: string;
  order: HardDeleteOrderTarget | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (input: { confirmOrderNumber: string; reason: string }) => void;
};

export function AdminHardDeleteOrderModal({
  open,
  branchId: _branchId,
  order,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [confirmOrderNumber, setConfirmOrderNumber] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setConfirmOrderNumber("");
    setReason("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, order?.id]);

  if (!open || !order) return null;

  const matches =
    confirmOrderNumber.trim() === order.orderNumber &&
    reason.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-b border-red-100 bg-red-50 px-5 py-4">
          <h2 id={titleId} className="text-base font-bold text-red-900">
            ลบออเดอร์ถาวร
          </h2>
          <p className="mt-1 text-sm text-red-800/90">
            จะคืนสต๊อก (ถ้าเคยตัด) แล้วลบออกจากประวัติถาวร — กู้คืนไม่ได้
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800">
            <p>
              <span className="text-gray-500">คิว</span>{" "}
              <strong>{formatQueueNumber(order.queueNumber)}</strong>
              {" · "}
              <span className="text-gray-500">เลขที่</span>{" "}
              <strong>#{order.orderNumber}</strong>
            </p>
            <p className="mt-1">
              <span className="text-gray-500">สถานะ</span>{" "}
              {ORDER_STATUS_LABELS[order.status]}
            </p>
          </div>

          <div>
            <label className={adminLabelClass} htmlFor="hard-delete-order-no">
              พิมพ์เลขที่ออเดอร์เพื่อยืนยัน ({order.orderNumber})
            </label>
            <input
              id="hard-delete-order-no"
              className={adminInputClass}
              value={confirmOrderNumber}
              onChange={(e) => setConfirmOrderNumber(e.target.value)}
              placeholder={order.orderNumber}
              autoComplete="off"
              disabled={busy}
            />
          </div>

          <div>
            <label className={adminLabelClass} htmlFor="hard-delete-reason">
              เหตุผลในการลบ
            </label>
            <textarea
              id="hard-delete-reason"
              className={`${adminInputClass} min-h-[4.5rem] resize-y`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น คีย์ผิด / ทดสอบ"
              disabled={busy}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            className={btnOutline}
            disabled={busy}
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={busy || !matches}
            onClick={() =>
              onConfirm({
                confirmOrderNumber: confirmOrderNumber.trim(),
                reason: reason.trim(),
              })
            }
            className="rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "กำลังลบ…" : "ลบถาวร"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { btnDanger, btnOutline } from "@/components/admin/AdminShell";
import { formatPrice } from "@/lib/constants";

type ShiftSummary = {
  shift: {
    id: string;
    calendarDate: string;
    roundNumber: number;
    openedAt: string;
    closedAt: string | null;
    openingCash: number;
    note: string | null;
    code: string;
  };
  orderCount: number;
  cancelledOrders: number;
  revenueBaht: number;
  cashRevenueBaht: number;
  transferRevenueBaht: number;
  totalWithOpeningCash: number;
  giftQuantity: number;
  menus: Array<{ name: string; quantity: number; revenueBaht: number }>;
};

type Props = {
  open: boolean;
  branchId: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

function formatHm(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function formatShiftDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
    return `${date} เวลา ${formatHm(iso)} น.`;
  } catch {
    return "—";
  }
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-1 py-2 text-sm ${
        last ? "" : "border-b border-slate-100"
      }`}
    >
      <span className="text-slate-600">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function AdminCloseStoreModal({
  open,
  branchId,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [noActiveShift, setNoActiveShift] = useState(false);

  useEffect(() => {
    if (!open) {
      setSummary(null);
      setError(null);
      setNoActiveShift(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const listRes = await fetch(`/api/admin/branches/${branchId}/shifts`);
        const listData = await listRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!listRes.ok) {
          setError(listData.error ?? "โหลดรอบไม่สำเร็จ");
          setSummary(null);
          return;
        }

        const active = listData.activeShift as { id?: string } | null;
        if (!active?.id) {
          setNoActiveShift(true);
          setSummary(null);
          return;
        }

        const sumRes = await fetch(
          `/api/admin/branches/${branchId}/shifts/${active.id}/summary`,
        );
        const sumData = await sumRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!sumRes.ok) {
          setError(sumData.error ?? "โหลดสรุปไม่สำเร็จ");
          setSummary(null);
          return;
        }
        setNoActiveShift(false);
        setSummary((sumData.summary as ShiftSummary) ?? null);
      } catch {
        if (!cancelled) setError("โหลดสรุปไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  return (
    <AdminModal
      open={open}
      title="ยืนยันปิดร้าน?"
      description="จะปิดรอบขายของพนักงานด้วย — ลูกค้าและพนักงานขายต่อไม่ได้จนกว่าจะเปิดใหม่"
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-lg"
    >
      <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {loading ? (
          <p className="text-sm text-slate-500">กำลังโหลดสรุปยอดรอบ…</p>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : noActiveShift ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ไม่มีรอบเปิดอยู่ — จะตั้งสถานะร้านเป็นปิดเท่านั้น
          </p>
        ) : summary ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">
              สรุปยอดรอบที่จะปิด
            </p>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-1">
              <Row label="เลขที่รอบ" value={summary.shift.code} />
              <Row
                label="เปิดเมื่อ"
                value={formatShiftDateTime(summary.shift.openedAt)}
              />
              <Row
                label="จำนวนออเดอร์"
                value={`${summary.orderCount.toLocaleString("th-TH")} ออเดอร์`}
              />
              {summary.cancelledOrders > 0 ? (
                <Row
                  label="ยกเลิก"
                  value={`${summary.cancelledOrders.toLocaleString("th-TH")} ออเดอร์`}
                />
              ) : null}
              <Row
                label="เงินเริ่มต้น"
                value={`${formatPrice(summary.shift.openingCash)} บาท`}
              />
              {summary.shift.note ? (
                <Row label="หมายเหตุ" value={summary.shift.note} />
              ) : null}
              <Row
                label="ยอดเงินสด"
                value={`${formatPrice(summary.cashRevenueBaht)} บาท`}
              />
              <Row
                label="ยอดเงินโอน"
                value={`${formatPrice(summary.transferRevenueBaht)} บาท`}
              />
              <Row
                label="ยอดขายสุทธิ"
                value={`${formatPrice(summary.revenueBaht)} บาท`}
              />
              <Row
                label="ยอดรวมเงินเริ่มต้น"
                value={`${formatPrice(summary.totalWithOpeningCash)} บาท`}
              />
              <Row
                label="จำนวนของแถม"
                value={`${summary.giftQuantity.toLocaleString("th-TH")} ชิ้น`}
                last
              />
            </div>

            {summary.menus.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-700">
                  เมนูที่ขาย (สูงสุด 8 รายการ)
                </p>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {summary.menus.slice(0, 8).map((m) => (
                    <li
                      key={m.name}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {m.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {m.quantity.toLocaleString("th-TH")} ชิ้น
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-slate-800">
                        {formatPrice(m.revenueBaht)}฿
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="text-center text-sm font-semibold text-slate-800">
          ปิดร้านจริงใช่ไหม?
        </p>

        <div className="flex gap-2 pb-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className={`flex-1 ${btnOutline}`}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void onConfirm()}
            className={`flex-1 ${btnDanger}`}
          >
            {busy ? "กำลังปิด…" : "ยืนยันปิดร้าน"}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

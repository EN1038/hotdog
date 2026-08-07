"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SkewerOrderStatus } from "@prisma/client";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  SKEWER_ORDER_STATUS_LABELS,
} from "@/lib/skewer-order";
import { bangkokDateKey } from "@/lib/constants";

type SkewerItem = {
  id: string;
  itemName: string;
  requestedQuantity: number;
  confirmedQuantity: number | null;
};

type SkewerOrderRow = {
  id: string;
  orderNumber: string;
  customerPhone: string;
  customerName: string;
  requestedDate: string;
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  status: SkewerOrderStatus;
  adminNote: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: SkewerItem[];
};

type Props = { branchId: string };

function statusTone(status: SkewerOrderStatus) {
  if (status === "PENDING_CONFIRM") return "bg-amber-50 text-amber-900 border-amber-200";
  if (status === "CONFIRMED") return "bg-emerald-50 text-emerald-900 border-emerald-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function formatDateLabel(ymd: string) {
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

export function BranchSkewerOrdersPanel({ branchId }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING_CONFIRM");
  const [dateFilter, setDateFilter] = useState("");
  const [orders, setOrders] = useState<SkewerOrderRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (dateFilter) params.set("date", dateFilter);
      const res = await fetch(
        `/api/admin/branches/${branchId}/skewer-orders?${params}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดออเดอร์ไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setPendingCount(Number(data.pendingCount) || 0);
    } finally {
      setLoading(false);
    }
  }, [branchId, statusFilter, dateFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setQtyDraft({});
      setAdminNote("");
      return;
    }
    const next: Record<string, string> = {};
    for (const item of selected.items) {
      next[item.id] = String(
        item.confirmedQuantity ?? item.requestedQuantity,
      );
    }
    setQtyDraft(next);
    setAdminNote(selected.adminNote ?? "");
  }, [selected]);

  async function confirmOrder() {
    if (!selected || selected.status !== "PENDING_CONFIRM") return;
    const items = selected.items.map((item) => {
      const n = Number.parseInt(qtyDraft[item.id] ?? "", 10);
      return { id: item.id, confirmedQuantity: n };
    });
    for (const item of selected.items) {
      const n = Number.parseInt(qtyDraft[item.id] ?? "", 10);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("จำนวนไม่ถูกต้อง", `กรอกจำนวนสำหรับ ${item.itemName}`);
        return;
      }
      if (n > item.requestedQuantity) {
        toast.error(
          "จำนวนเกินที่สั่ง",
          `${item.itemName} สั่ง ${item.requestedQuantity} ไม้`,
        );
        return;
      }
    }

    const ok = await confirm({
      title: "ยืนยันออเดอร์นี้?",
      message: `ลูกค้า ${selected.customerPhone} · วันที่ต้องการ ${formatDateLabel(selected.requestedDate)} — หลังยืนยันลูกค้าจะเห็นจำนวนที่ได้ในประวัติ`,
      confirmLabel: "ยืนยัน",
      tone: "primary",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/skewer-orders`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm",
            orderId: selected.id,
            items,
            adminNote: adminNote.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ยืนยันไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ยืนยันออเดอร์แล้ว");
      setSelectedId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function cancelOrder() {
    if (!selected || selected.status !== "PENDING_CONFIRM") return;
    const ok = await confirm({
      title: "ยกเลิกออเดอร์นี้?",
      message: `#${selected.orderNumber} · ${selected.customerPhone}`,
      confirmLabel: "ยกเลิกออเดอร์",
      tone: "danger",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/skewer-orders`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            orderId: selected.id,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ยกเลิกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("ยกเลิกออเดอร์แล้ว");
      setSelectedId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-amber-50 via-white to-amber-50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">ออเดอร์เสียบไม้</h3>
              <p className="mt-0.5 text-sm text-gray-600">
                ดูเบอร์ลูกค้า วันที่ต้องการ และยืนยันจำนวนไม้ที่ได้จริงหลังโทรคุย
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                รอ {pendingCount} รายการ
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <div>
              <label className={adminLabelClass}>สถานะ</label>
              <select
                className={adminInputClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="PENDING_CONFIRM">รอยืนยัน</option>
                <option value="CONFIRMED">ยืนยันแล้ว</option>
                <option value="CANCELLED">ยกเลิก</option>
                <option value="ALL">ทั้งหมด</option>
              </select>
            </div>
            <div>
              <label className={adminLabelClass}>วันที่ต้องการ</label>
              <DateInput
                className={adminInputClass}
                value={dateFilter}
                onChange={setDateFilter}
                placeholder={bangkokDateKey()}
              />
            </div>
            {dateFilter && (
              <button
                type="button"
                className="self-end text-sm text-gray-600 underline"
                onClick={() => setDateFilter("")}
              >
                ล้างวันที่
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-5">
          <div className="lg:col-span-2 border-b border-gray-100 lg:border-b-0 lg:border-r">
            {loading ? (
              <p className="p-5 text-sm text-gray-500">กำลังโหลด…</p>
            ) : orders.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">ยังไม่มีออเดอร์ตามตัวกรอง</p>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
                {orders.map((order) => {
                  const active = order.id === selectedId;
                  return (
                    <li key={order.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        className={`w-full px-4 py-3 text-left transition ${
                          active ? "bg-amber-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-gray-900">
                            {order.customerPhone || "—"}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(order.status)}`}
                          >
                            {SKEWER_ORDER_STATUS_LABELS[order.status]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-600">
                          ต้องการ {formatDateLabel(order.requestedDate)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          #{order.orderNumber}
                          {order.customerName ? ` · ${order.customerName}` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="lg:col-span-3 p-5">
            {!selected ? (
              <p className="text-sm text-gray-500">เลือกออเดอร์ทางซ้ายเพื่อดูรายละเอียด</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    #{selected.orderNumber}
                  </p>
                  <h4 className="mt-1 text-lg font-semibold text-gray-900">
                    {selected.customerPhone}
                    {selected.customerName ? (
                      <span className="ml-2 text-base font-normal text-gray-600">
                        {selected.customerName}
                      </span>
                    ) : null}
                  </h4>
                  <p className="mt-1 text-sm text-gray-700">
                    วันที่ต้องการ:{" "}
                    <strong>{formatDateLabel(selected.requestedDate)}</strong>
                  </p>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                    ที่อยู่: {selected.addressText}
                  </p>
                  {selected.latitude != null && selected.longitude != null && (
                    <a
                      className="mt-1 inline-block text-sm text-sky-700 underline"
                      href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิดแผนที่
                    </a>
                  )}
                  {selected.note && (
                    <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      โน้ตลูกค้า: {selected.note}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-900">รายการไม้</p>
                  {selected.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{item.itemName}</p>
                        <p className="text-xs text-gray-500">
                          สั่ง {item.requestedQuantity} ไม้
                          {item.confirmedQuantity != null
                            ? ` · ได้ ${item.confirmedQuantity} ไม้`
                            : ""}
                        </p>
                      </div>
                      {selected.status === "PENDING_CONFIRM" ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={item.requestedQuantity}
                            className={`${adminInputClass} w-24`}
                            value={qtyDraft[item.id] ?? ""}
                            onChange={(e) =>
                              setQtyDraft((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-sm text-gray-500">ไม้</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {selected.status === "PENDING_CONFIRM" && (
                  <>
                    <div>
                      <label className={adminLabelClass}>โน้ตแอดมิน (ถ้ามี)</label>
                      <textarea
                        className={adminInputClass}
                        rows={2}
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="สรุปหลังโทรคุย เช่น สถานที่ ราคา"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={confirmOrder}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        ยืนยันจำนวนที่ได้
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={cancelOrder}
                        className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        ยกเลิกออเดอร์
                      </button>
                    </div>
                  </>
                )}

                {selected.status === "CONFIRMED" && selected.adminNote && (
                  <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    โน้ตแอดมิน: {selected.adminNote}
                  </p>
                )}
                {selected.status === "CANCELLED" && selected.cancelReason && (
                  <p className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                    เหตุผลยกเลิก: {selected.cancelReason}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import {
  EXPENSE_QUICK_TITLES,
  PAY_CHANNEL_LABEL,
} from "@/lib/branch-expense-ui";
import { bangkokDateKey, bangkokMonthRangeToToday, formatPrice, isBangkokDateKey } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

type PayChannel = "CASH" | "TRANSFER";

type Expense = {
  id: string;
  title: string;
  amount: number;
  payChannel: PayChannel;
  expenseDate: string;
  note: string | null;
  createdAt: string;
  createdByStaff: { name: string | null } | null;
  createdByAdmin: { username: string } | null;
};

type Summary = {
  count: number;
  total: number;
  cash: number;
  transfer: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialDate?: string | null;
};

const emptyForm = () => ({
  title: "",
  amount: "",
  payChannel: "CASH" as PayChannel,
  note: "",
});

function formatTimeTh(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatExpenseDateTh(key: string) {
  return formatOperatingDayLabel(key) || key;
}

function rangeLabel(from: string, to: string) {
  const a = formatExpenseDateTh(from);
  const b = formatExpenseDateTh(to);
  return from === to ? a : `${a} – ${b}`;
}

export function StaffExpensesSheet({ open, onClose, initialDate }: Props) {
  const router = useRouter();
  const toast = useToast();
  const defaultTo = () =>
    initialDate && isBangkokDateKey(initialDate)
      ? initialDate
      : bangkokDateKey();
  const defaultFrom = () => {
    const to = defaultTo();
    const [y, m] = to.split("-");
    return `${y}-${m}-01`;
  };

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [formExpenseDate, setFormExpenseDate] = useState(defaultTo);
  const [channelFilter, setChannelFilter] = useState<"ALL" | PayChannel>(
    "ALL",
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary>({
    count: 0,
    total: 0,
    cash: 0,
    transfer: 0,
  });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const range = bangkokMonthRangeToToday();
    const to =
      initialDate && isBangkokDateKey(initialDate) ? initialDate : range.to;
    const [y, m] = to.split("-");
    setDateFrom(`${y}-${m}-01`);
    setDateTo(to);
    setFormExpenseDate(to);
    setChannelFilter("ALL");
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(false);
  }, [open, initialDate]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const from = dateFrom <= dateTo ? dateFrom : dateTo;
      const to = dateFrom <= dateTo ? dateTo : dateFrom;
      const params = new URLSearchParams({ from, to });
      if (channelFilter !== "ALL") params.set("payChannel", channelFilter);
      const res = await fetch(`/api/staff/expenses?${params}`);
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "โหลดค่าใช้จ่ายไม่สำเร็จ");
        return;
      }
      setExpenses(body.expenses || []);
      setSummary(
        body.summary || { count: 0, total: 0, cash: 0, transfer: 0 },
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [channelFilter, dateFrom, dateTo, open, router, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(row: Expense) {
    setEditingId(row.id);
    setFormExpenseDate(row.expenseDate || bangkokDateKey());
    setForm({
      title: row.title,
      amount: String(row.amount),
      payChannel: row.payChannel,
      note: row.note ?? "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setFormExpenseDate(bangkokDateKey());
  }

  async function submit() {
    const amount = Number(form.amount);
    if (!form.title.trim()) {
      toast.error("กรุณาระบุชื่อรายการ");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }
    if (!isBangkokDateKey(formExpenseDate)) {
      toast.error("วันที่รายการไม่ถูกต้อง");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        amount,
        payChannel: form.payChannel,
        expenseDate: formExpenseDate,
        note: form.note.trim() || null,
      };
      const res = await fetch(
        editingId ? `/api/staff/expenses/${editingId}` : "/api/staff/expenses",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(editingId ? "แก้ไขแล้ว" : "บันทึกค่าใช้จ่ายแล้ว");
      resetForm();
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`ลบรายการ “${title}” ออกจากระบบ?`)) return;
    const res = await fetch(`/api/staff/expenses/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบแล้ว");
    if (editingId === id) resetForm();
    await load();
  }

  const from = dateFrom <= dateTo ? dateFrom : dateTo;
  const to = dateFrom <= dateTo ? dateTo : dateFrom;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ค่าใช้จ่าย"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">
              {showForm
                ? editingId
                  ? "แก้ไขค่าใช้จ่าย"
                  : "บันทึกค่าใช้จ่าย"
                : "ค่าใช้จ่าย"}
            </p>
            <p className="text-xs text-gray-500">
              {showForm
                ? editingId
                  ? "แก้ไขรายการแล้วกดบันทึก — กดยกเลิกเพื่อกลับไปดูประวัติ"
                  : "กรอกข้อมูลแล้วกดบันทึก — กดยกเลิกเพื่อกลับไปดูประวัติ"
                : "เลือกช่วงวันเพื่อดูยอดและประวัติ หรือบันทึกรายการใหม่"}
            </p>
          </div>
          <button
            type="button"
            onClick={
              showForm
                ? () => {
                    resetForm();
                    setShowForm(false);
                  }
                : onClose
            }
            className="rounded-lg px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            {showForm ? "ยกเลิก" : "ปิด"}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!showForm ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-gray-600">
                  วันที่เริ่ม
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo}
                    onChange={(e) => {
                      if (e.target.value && isBangkokDateKey(e.target.value)) {
                        setDateFrom(e.target.value);
                      } else if (e.target.value) {
                        setDateFrom(e.target.value);
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  วันที่สิ้นสุด
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    onChange={(e) => {
                      if (e.target.value && isBangkokDateKey(e.target.value)) {
                        setDateTo(e.target.value);
                      } else if (e.target.value) {
                        setDateTo(e.target.value);
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 rounded-xl bg-rose-600 px-3 py-2.5 text-white">
                  <p className="text-[11px] font-medium text-white/85">
                    รวมค่าใช้จ่าย {rangeLabel(from, to)}
                  </p>
                  <p className="mt-0.5 text-xl font-black tabular-nums">
                    {formatPrice(summary.total)}฿
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/80">
                    {summary.count} รายการ
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-medium text-gray-500">เงินสด</p>
                  <p className="text-sm font-bold tabular-nums text-gray-900">
                    {formatPrice(summary.cash)}฿
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-medium text-gray-500">โอน</p>
                  <p className="text-sm font-bold tabular-nums text-gray-900">
                    {formatPrice(summary.transfer)}฿
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {(
                  [
                    ["ALL", "ทั้งหมด"],
                    ["CASH", "เงินสด"],
                    ["TRANSFER", "โอน"],
                  ] as const
                ).map(([key, label]) => {
                  const active = channelFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChannelFilter(key)}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold ${
                        active
                          ? "bg-slate-900 text-white"
                          : "border border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {loading ? (
                <p className="text-sm text-gray-500">กำลังโหลด…</p>
              ) : expenses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
                  ยังไม่มีค่าใช้จ่ายในช่วง {rangeLabel(from, to)}
                </p>
              ) : (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-gray-700">
                    ประวัติรายการ
                  </p>
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                    {expenses.map((row) => (
                      <li key={row.id} className="bg-white px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {row.title}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {formatExpenseDateTh(row.expenseDate)}
                              {` · ${PAY_CHANNEL_LABEL[row.payChannel]}`}
                              {formatTimeTh(row.createdAt)
                                ? ` · ${formatTimeTh(row.createdAt)} น.`
                                : ""}
                              {row.createdByStaff?.name
                                ? ` · ${row.createdByStaff.name}`
                                : row.createdByAdmin?.username
                                  ? ` · แอดมิน ${row.createdByAdmin.username}`
                                  : ""}
                            </p>
                            {row.note ? (
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                                {row.note}
                              </p>
                            ) : null}
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-rose-700">
                            {formatPrice(row.amount)}฿
                          </p>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(row.id, row.title)}
                            className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700"
                          >
                            ลบ
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
              <p className="text-sm font-bold text-gray-900">
                {editingId ? "แก้ไขรายการ" : "บันทึกรายการใหม่"}
              </p>

              <label className="block text-xs font-medium text-gray-600">
                วันที่รายการ
                <input
                  type="date"
                  value={formExpenseDate}
                  onChange={(e) => {
                    if (e.target.value) setFormExpenseDate(e.target.value);
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                />
              </label>

              <div className="flex flex-wrap gap-1.5">
                {EXPENSE_QUICK_TITLES.map((t) => {
                  const active = form.title === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          title: t === "อื่นๆ" ? "" : t,
                        }))
                      }
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        active
                          ? "bg-rose-600 text-white"
                          : "bg-white text-gray-700 ring-1 ring-gray-200"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              <label className="block text-xs font-medium text-gray-600">
                ชื่อรายการ
                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="เช่น ก๊าซ / น้ำแข็ง"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                />
              </label>

              <label className="block text-xs font-medium text-gray-600">
                จำนวนเงิน (บาท)
                <input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-gray-900"
                />
              </label>

              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-600">
                  ช่องทางจ่าย
                </p>
                <div className="flex gap-2">
                  {(["CASH", "TRANSFER"] as const).map((ch) => {
                    const active = form.payChannel === ch;
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, payChannel: ch }))
                        }
                        className={`flex-1 rounded-xl py-2 text-sm font-bold ${
                          active
                            ? "bg-rose-600 text-white"
                            : "bg-white text-gray-700 ring-1 ring-gray-200"
                        }`}
                      >
                        {PAY_CHANNEL_LABEL[ch]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block text-xs font-medium text-gray-600">
                หมายเหตุ (ถ้ามี)
                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value }))
                  }
                  rows={2}
                  placeholder="รายละเอียดเพิ่มเติม"
                  className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-gray-100 px-4 py-3">
          {showForm ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit()}
                className="w-full rounded-xl bg-rose-600 py-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60 active:scale-[0.99]"
              >
                {saving
                  ? "กำลังบันทึก…"
                  : editingId
                    ? "บันทึกการแก้ไข"
                    : "บันทึกค่าใช้จ่าย"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-700"
              >
                กลับไปดูประวัติ
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="w-full rounded-xl bg-rose-600 py-3 text-sm font-extrabold text-white shadow-sm active:scale-[0.99]"
            >
              บันทึกค่าใช้จ่ายใหม่
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

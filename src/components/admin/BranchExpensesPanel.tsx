"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { bangkokDateKey, bangkokMonthRangeToToday, formatPrice } from "@/lib/constants";
import {
  EXPENSE_QUICK_TITLES,
  PAY_CHANNEL_LABEL,
} from "@/lib/branch-expense-ui";

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

const emptyForm = () => ({
  title: "",
  amount: "",
  payChannel: "CASH" as PayChannel,
  expenseDate: bangkokDateKey(),
  note: "",
});

function formatExpenseDateTh(key: string) {
  // expenseDate จาก API เป็น YYYY-MM-DD ของวันที่รายการ (ไม่ใช่วันที่สร้าง)
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return key;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const buddhistY = y + 543;
  const months = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  return `${d} ${months[mo - 1]} ${buddhistY}`;
}

export function BranchExpensesPanel({ branchId }: { branchId: string }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [dateFrom, setDateFrom] = useState(
    () => bangkokMonthRangeToToday().from,
  );
  const [dateTo, setDateTo] = useState(() => bangkokMonthRangeToToday().to);
  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState<"ALL" | PayChannel>(
    "ALL",
  );
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateFrom <= dateTo ? dateFrom : dateTo;
      const to = dateFrom <= dateTo ? dateTo : dateFrom;
      const params = new URLSearchParams({ from, to });
      if (channelFilter !== "ALL") params.set("payChannel", channelFilter);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(
        `/api/admin/branches/${branchId}/expenses?${params}`,
      );
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
  }, [branchId, dateFrom, dateTo, channelFilter, q, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(row: Expense) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      amount: String(row.amount),
      payChannel: row.payChannel,
      expenseDate: row.expenseDate,
      note: row.note ?? "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
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

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        amount,
        payChannel: form.payChannel,
        expenseDate: form.expenseDate,
        note: form.note.trim() || null,
      };
      const res = await fetch(
        editingId
          ? `/api/admin/branches/${branchId}/expenses/${editingId}`
          : `/api/admin/branches/${branchId}/expenses`,
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
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, title: string) {
    const ok = await confirm({
      title: "ลบค่าใช้จ่าย?",
      message: `ลบรายการ “${title}” ออกจากระบบ`,
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/branches/${branchId}/expenses/${id}`,
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบแล้ว");
    if (editingId === id) resetForm();
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-slate-900">
              ค่าใช้จ่ายสาขา
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              แอดมินบันทึกเอง — ระบุรายการ จำนวนเงิน และช่องทางชำระ (เงินสด/โอน)
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[10.5rem]">
              <label className={adminLabelClass}>วันที่เริ่ม</label>
              <DateInput
                className={adminInputClass}
                value={dateFrom}
                max={dateTo || bangkokDateKey()}
                onChange={(v) => {
                  if (v) setDateFrom(v);
                }}
              />
            </div>
            <div className="w-[10.5rem]">
              <label className={adminLabelClass}>วันที่สิ้นสุด</label>
              <DateInput
                className={adminInputClass}
                value={dateTo}
                min={dateFrom}
                max={bangkokDateKey()}
                onChange={(v) => {
                  if (v) setDateTo(v);
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-slate-500">รายการ</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900">
              {summary.count}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-slate-500">รวมทั้งหมด</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900">
              ฿{formatPrice(summary.total)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-emerald-700">เงินสด</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-emerald-900">
              ฿{formatPrice(summary.cash)}
            </p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3">
            <p className="text-[11px] font-semibold text-sky-700">โอน</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-sky-900">
              ฿{formatPrice(summary.transfer)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-extrabold text-slate-900">
          {editingId ? "แก้ไขรายการ" : "บันทึกรายการใหม่"}
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXPENSE_QUICK_TITLES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={saving}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  title: t === "อื่นๆ" ? "" : t,
                }))
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                form.title === t
                  ? "bg-site-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={adminLabelClass}>ชื่อรายการ</label>
            <input
              className={adminInputClass}
              value={form.title}
              disabled={saving}
              placeholder="เช่น ก๊าซ, น้ำแข็ง"
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={adminLabelClass}>จำนวนเงิน (บาท)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={adminInputClass}
              value={form.amount}
              disabled={saving}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={adminLabelClass}>วันที่</label>
            <DateInput
              className={adminInputClass}
              value={form.expenseDate}
              max={bangkokDateKey()}
              onChange={(v) => {
                if (v) setForm((f) => ({ ...f, expenseDate: v }));
              }}
            />
          </div>
          <div>
            <label className={adminLabelClass}>ช่องทางชำระเงิน</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["CASH", "เงินสด"],
                  ["TRANSFER", "โอน"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    setForm((f) => ({ ...f, payChannel: id }))
                  }
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    form.payChannel === id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={adminLabelClass}>หมายเหตุ</label>
            <input
              className={adminInputClass}
              value={form.note}
              disabled={saving}
              placeholder="เช่น เปลี่ยนถัง / รอบสัปดาห์นี้"
              onChange={(e) =>
                setForm((f) => ({ ...f, note: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-xl bg-site-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving
              ? "กำลังบันทึก…"
              : editingId
                ? "บันทึกการแก้ไข"
                : "บันทึกค่าใช้จ่าย"}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={saving}
              onClick={resetForm}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
            >
              ยกเลิกแก้ไข
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <label className={adminLabelClass}>ค้นหา</label>
            <input
              type="search"
              className={adminInputClass}
              value={q}
              placeholder="ชื่อรายการ / หมายเหตุ"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {(
              [
                ["ALL", "ทั้งหมด"],
                ["CASH", "เงินสด"],
                ["TRANSFER", "โอน"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChannelFilter(id)}
                className={`rounded-lg px-3 py-2 text-xs font-bold ${
                  channelFilter === id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <AdminLoadingState className="py-8" />
          ) : expenses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm font-semibold text-slate-500">
              ยังไม่มีค่าใช้จ่ายในช่วงวันที่เลือก
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">วันที่รายการ</th>
                    <th className="px-3 py-2.5 font-semibold">รายการ</th>
                    <th className="px-3 py-2.5 font-semibold">ช่องทาง</th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      จำนวน
                    </th>
                    <th className="px-3 py-2.5 font-semibold">ผู้บันทึก</th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((row) => {
                    const who =
                      row.createdByStaff?.name ||
                      row.createdByAdmin?.username ||
                      "—";
                    return (
                      <tr key={row.id} className="bg-white">
                        <td
                          className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700"
                          title={`วันที่รายการ ${row.expenseDate}`}
                        >
                          {formatExpenseDateTh(row.expenseDate)}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-900">
                            {row.title}
                          </p>
                          {row.note ? (
                            <p className="text-xs text-slate-400">{row.note}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {PAY_CHANNEL_LABEL[row.payChannel]}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900">
                          ฿{formatPrice(row.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{who}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="mr-2 text-xs font-bold text-site-primary hover:underline"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(row.id, row.title)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

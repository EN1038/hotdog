"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { DateInput } from "@/components/DateInput";
import {
  EXPENSE_QUICK_TITLES,
  PAY_CHANNEL_LABEL,
} from "@/lib/branch-expense-ui";
import { INCOME_QUICK_TITLES } from "@/lib/branch-income-ui";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";

export type AccountEntryKind = "income" | "expense";

export type AccountEntryEdit = {
  kind: AccountEntryKind;
  id: string;
  title: string;
  amount: number;
  payChannel: "CASH" | "TRANSFER";
  date: string;
  note: string | null;
};

export type AccountEntryApiMode = "staff" | "owner";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Initial kind when opening create mode */
  initialKind?: AccountEntryKind;
  /** When set, opens in edit mode (kind locked) */
  edit?: AccountEntryEdit | null;
  onSaved?: () => void;
  /** staff (default) uses /api/staff/*; owner uses /api/owner/* + branchId */
  apiMode?: AccountEntryApiMode;
  /** Required when apiMode is owner */
  branchId?: string;
};

const emptyForm = () => ({
  title: "",
  amount: "",
  payChannel: "CASH" as "CASH" | "TRANSFER",
  note: "",
});

export function StaffAccountEntrySheet({
  open,
  onClose,
  initialKind = "expense",
  edit = null,
  onSaved,
  apiMode = "staff",
  branchId,
}: Props) {
  const toast = useToast();
  const editing = Boolean(edit);
  const [kind, setKind] = useState<AccountEntryKind>(initialKind);
  const [entryDate, setEntryDate] = useState(bangkokDateKey());
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setKind(edit.kind);
      setEntryDate(edit.date || bangkokDateKey());
      setForm({
        title: edit.title,
        amount: String(edit.amount),
        payChannel: edit.payChannel,
        note: edit.note ?? "",
      });
      return;
    }
    setKind(initialKind);
    setEntryDate(bangkokDateKey());
    setForm(emptyForm());
  }, [open, edit, initialKind]);

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
    if (!isBangkokDateKey(entryDate)) {
      toast.error("วันที่รายการไม่ถูกต้อง");
      return;
    }

    if (apiMode === "owner" && !branchId) {
      toast.error("ไม่พบสาขา");
      return;
    }

    setSaving(true);
    try {
      const isIncome = kind === "income";
      const payload = isIncome
        ? {
            title: form.title.trim(),
            amount,
            payChannel: form.payChannel,
            incomeDate: entryDate,
            note: form.note.trim() || null,
            ...(apiMode === "owner" ? { branchId } : {}),
          }
        : {
            title: form.title.trim(),
            amount,
            payChannel: form.payChannel,
            expenseDate: entryDate,
            note: form.note.trim() || null,
            ...(apiMode === "owner" ? { branchId } : {}),
          };

      const prefix = apiMode === "owner" ? "/api/owner" : "/api/staff";
      const base = isIncome ? `${prefix}/incomes` : `${prefix}/expenses`;
      const url = editing && edit ? `${base}/${edit.id}` : base;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(
        editing
          ? "แก้ไขแล้ว"
          : isIncome
            ? "บันทึกรายรับแล้ว"
            : "บันทึกรายจ่ายแล้ว",
      );
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const quickTitles =
    kind === "income" ? INCOME_QUICK_TITLES : EXPENSE_QUICK_TITLES;
  const accent = kind === "income" ? "emerald" : "rose";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "แก้ไขรายการ" : "บันทึกรายการ"}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">
              {editing
                ? kind === "income"
                  ? "แก้ไขรายรับ"
                  : "แก้ไขรายจ่าย"
                : "บันทึกรายการ"}
            </p>
            <p className="text-xs text-gray-500">
              {editing
                ? "แก้ไขแล้วกดบันทึก"
                : "เลือกรายรับหรือรายจ่าย แล้วกรอกข้อมูล"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!editing ? (
            <div className="flex gap-2">
              {(
                [
                  ["income", "รายรับ"],
                  ["expense", "รายจ่าย"],
                ] as const
              ).map(([key, label]) => {
                const active = kind === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setKind(key);
                      setForm(emptyForm());
                    }}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
                      active
                        ? key === "income"
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
                        : "border border-gray-200 bg-white text-gray-600"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div
            className={`space-y-3 rounded-xl border p-3 ${
              kind === "income"
                ? "border-emerald-100 bg-emerald-50/40"
                : "border-rose-100 bg-rose-50/40"
            }`}
          >
            <label className="block text-xs font-medium text-gray-600">
              วันที่รายการ
              <DateInput
                value={entryDate}
                aria-label="วันที่รายการ"
                onChange={(v) => {
                  if (v) setEntryDate(v);
                }}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
              />
            </label>

            <div className="flex flex-wrap gap-1.5">
              {quickTitles.map((t) => {
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
                        ? accent === "emerald"
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
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
                placeholder={
                  kind === "income" ? "เช่น เงินทุนหมุนเวียน" : "เช่น ก๊าซ / น้ำแข็ง"
                }
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
                {kind === "income" ? "ช่องทางรับ" : "ช่องทางจ่าย"}
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
                          ? accent === "emerald"
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
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
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className={`w-full rounded-xl py-3 text-sm font-extrabold text-white shadow-sm disabled:opacity-60 active:scale-[0.99] ${
              kind === "income" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {saving
              ? "กำลังบันทึก…"
              : editing
                ? "บันทึกการแก้ไข"
                : kind === "income"
                  ? "บันทึกรายรับ"
                  : "บันทึกรายจ่าย"}
          </button>
        </div>
      </div>
    </div>
  );
}

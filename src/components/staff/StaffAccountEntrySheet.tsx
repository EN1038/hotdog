"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { DateInput } from "@/components/DateInput";
import {
  EXPENSE_QUICK_TITLES,
  PAY_CHANNEL_LABEL,
} from "@/lib/branch-expense-ui";
import { INCOME_QUICK_TITLES } from "@/lib/branch-income-ui";
import {
  bangkokDateKey,
  formatPrice,
  isBangkokDateKey,
} from "@/lib/constants";
import { IconClose } from "@/components/icons";

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

type ShiftListItem = {
  id: string;
  calendarDate: string;
  roundNumber: number;
  openedAt: string;
  closedAt: string | null;
  isCancelled?: boolean;
  cancelledAt?: string | null;
  orderCount: number;
  completedCount: number;
  revenueBaht: number;
};

type ImportPanel = {
  date: string;
  shifts: ShiftListItem[];
  loading: boolean;
  notice: string | null;
};

const emptyForm = () => ({
  title: "",
  amount: "",
  cashAmount: "",
  transferAmount: "",
  payChannel: "CASH" as "CASH" | "TRANSFER",
  note: "",
  importRound: null as number | null,
});

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

function parseAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function bangkokYesterdayKey(today = bangkokDateKey()): string {
  const d = new Date(`${today}T12:00:00+07:00`);
  d.setTime(d.getTime() - 24 * 60 * 60 * 1000);
  return bangkokDateKey(d);
}

function clampToToday(date: string, today = bangkokDateKey()): string {
  if (!isBangkokDateKey(date)) return today;
  return date > today ? today : date;
}

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
  const todayKey = bangkokDateKey();
  const [kind, setKind] = useState<AccountEntryKind>(initialKind);
  const [entryDate, setEntryDate] = useState(todayKey);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importPanel, setImportPanel] = useState<ImportPanel | null>(null);

  const incomeCreate = kind === "income" && !editing;

  useEffect(() => {
    if (!open) return;
    setImportPanel(null);
    const today = bangkokDateKey();
    if (edit) {
      setKind(edit.kind);
      setEntryDate(clampToToday(edit.date || today, today));
      setForm({
        ...emptyForm(),
        title: edit.title,
        amount: String(edit.amount),
        payChannel: edit.payChannel,
        note: edit.note ?? "",
      });
      return;
    }
    setKind(initialKind);
    setEntryDate(today);
    setForm(emptyForm());
  }, [open, edit, initialKind]);

  async function fetchShiftsForDate(date: string): Promise<ShiftListItem[]> {
    const prefix = apiMode === "owner" ? "/api/owner" : "/api/staff";
    const params = new URLSearchParams({ date });
    if (apiMode === "owner" && branchId) {
      params.set("branchId", branchId);
    }
    const res = await fetch(`${prefix}/shifts?${params}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      shifts?: ShiftListItem[];
    };
    if (!res.ok) {
      throw new Error(data.error || "โหลดรอบขายไม่สำเร็จ");
    }
    return (data.shifts ?? []).filter(
      (s) => !s.isCancelled && !s.cancelledAt,
    );
  }

  async function loadImportPanelDate(
    rawDate: string,
    opts?: { allowYesterdayFallback?: boolean },
  ) {
    const today = bangkokDateKey();
    const date = clampToToday(rawDate, today);
    setImportPanel((prev) => ({
      date,
      shifts: prev?.date === date ? prev.shifts : [],
      loading: true,
      notice: null,
    }));

    try {
      let shifts = await fetchShiftsForDate(date);
      let notice: string | null = null;
      let resolvedDate = date;

      if (
        shifts.length === 0 &&
        date === today &&
        opts?.allowYesterdayFallback !== false
      ) {
        const yesterday = bangkokYesterdayKey(today);
        const yShifts = await fetchShiftsForDate(yesterday);
        if (yShifts.length > 0) {
          shifts = yShifts;
          resolvedDate = yesterday;
          notice = "วันนี้ยังไม่มีรอบขาย — แสดงของเมื่อวาน";
          toast.pushToast({
            title: "วันนี้ยังไม่มีรอบขาย",
            message: "แสดงรอบขายของเมื่อวานแทน",
            tone: "info",
          });
        } else {
          notice = "ยังไม่มีรอบขายวันนี้และเมื่อวาน";
          toast.error("ยังไม่มีรอบขายวันนี้และเมื่อวาน");
        }
      } else if (shifts.length === 0) {
        notice = "ไม่มีรอบขายในวันที่เลือก";
        toast.error("ไม่มีรอบขายในวันที่เลือก");
      }

      setEntryDate(resolvedDate);
      setImportPanel({
        date: resolvedDate,
        shifts,
        loading: false,
        notice,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เชื่อมต่อไม่ได้");
      setImportPanel(null);
    }
  }

  async function applyShiftImport(shift: ShiftListItem, date: string) {
    setImportPanel((prev) =>
      prev
        ? { ...prev, loading: true, notice: null }
        : { date, shifts: [], loading: true, notice: null },
    );

    const prefix = apiMode === "owner" ? "/api/owner" : "/api/staff";
    const qs =
      apiMode === "owner" && branchId
        ? `?branchId=${encodeURIComponent(branchId)}`
        : "";
    const res = await fetch(`${prefix}/shifts/${shift.id}/summary${qs}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      summary?: {
        cashRevenueBaht?: number;
        transferRevenueBaht?: number;
      };
    };
    if (!res.ok) {
      toast.error(data.error || "โหลดสรุปรอบไม่สำเร็จ");
      setImportPanel((prev) =>
        prev ? { ...prev, loading: false } : null,
      );
      return;
    }

    const cash = Number(data.summary?.cashRevenueBaht ?? 0);
    const transfer = Number(data.summary?.transferRevenueBaht ?? 0);
    if (cash <= 0 && transfer <= 0) {
      toast.error("ไม่มียอดขายเงินสดหรือโอนในรอบนี้");
      setImportPanel((prev) =>
        prev ? { ...prev, loading: false } : null,
      );
      return;
    }

    setEntryDate(clampToToday(date));
    setForm((f) => ({
      ...f,
      title: f.title.trim() || `ยอดขาย · รอบ ${shift.roundNumber}`,
      cashAmount: cash > 0 ? String(cash) : "",
      transferAmount: transfer > 0 ? String(transfer) : "",
      importRound: shift.roundNumber,
    }));
    setImportPanel(null);
    toast.success(
      `นำเข้าจากรอบ ${shift.roundNumber} แล้ว — ตรวจแล้วกดบันทึก`,
    );
  }

  function openImportFromShifts() {
    if (!incomeCreate) return;
    if (apiMode === "owner" && !branchId) {
      toast.error("ไม่พบสาขา");
      return;
    }
    const startDate = clampToToday(
      isBangkokDateKey(entryDate) ? entryDate : bangkokDateKey(),
    );
    void loadImportPanelDate(startDate, { allowYesterdayFallback: true });
  }

  async function postIncome(payload: {
    title: string;
    amount: number;
    payChannel: "CASH" | "TRANSFER";
    incomeDate: string;
    note: string | null;
    branchId?: string;
  }) {
    const prefix = apiMode === "owner" ? "/api/owner" : "/api/staff";
    const res = await fetch(`${prefix}/incomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof body.error === "string" ? body.error : "บันทึกไม่สำเร็จ",
      );
    }
  }

  async function submit() {
    const today = bangkokDateKey();
    const date = clampToToday(entryDate, today);
    if (!isBangkokDateKey(date)) {
      toast.error("วันที่รายการไม่ถูกต้อง");
      return;
    }
    if (apiMode === "owner" && !branchId) {
      toast.error("ไม่พบสาขา");
      return;
    }

    const prefix = apiMode === "owner" ? "/api/owner" : "/api/staff";
    const note = form.note.trim() || null;

    if (incomeCreate) {
      const cash = parseAmount(form.cashAmount);
      const transfer = parseAmount(form.transferAmount);
      const cashOk = Number.isFinite(cash) && cash > 0;
      const transferOk = Number.isFinite(transfer) && transfer > 0;
      if (!cashOk && !transferOk) {
        toast.error("กรุณาระบุจำนวนเงินสดหรือโอนอย่างน้อยหนึ่งช่อง");
        return;
      }
      if (form.cashAmount.trim() && !cashOk) {
        toast.error("จำนวนเงินสดไม่ถูกต้อง");
        return;
      }
      if (form.transferAmount.trim() && !transferOk) {
        toast.error("จำนวนเงินโอนไม่ถูกต้อง");
        return;
      }

      const baseTitle =
        form.title.trim() ||
        (form.importRound != null
          ? `ยอดขาย · รอบ ${form.importRound}`
          : "ยอดขาย");
      const both = cashOk && transferOk;

      setSaving(true);
      try {
        if (cashOk) {
          await postIncome({
            title: both ? `${baseTitle} · เงินสด` : baseTitle,
            amount: cash,
            payChannel: "CASH",
            incomeDate: date,
            note,
            ...(apiMode === "owner" ? { branchId } : {}),
          });
        }
        if (transferOk) {
          await postIncome({
            title: both ? `${baseTitle} · โอน` : baseTitle,
            amount: transfer,
            payChannel: "TRANSFER",
            incomeDate: date,
            note,
            ...(apiMode === "owner" ? { branchId } : {}),
          });
        }
        toast.success(
          both ? "บันทึกรายรับเงินสดและโอนแล้ว" : "บันทึกรายรับแล้ว",
        );
        onSaved?.();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      } finally {
        setSaving(false);
      }
      return;
    }

    const amount = parseAmount(form.amount);
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
      const isIncome = kind === "income";
      const payload = isIncome
        ? {
            title: form.title.trim(),
            amount,
            payChannel: form.payChannel,
            incomeDate: date,
            note,
            ...(apiMode === "owner" ? { branchId } : {}),
          }
        : {
            title: form.title.trim(),
            amount,
            payChannel: form.payChannel,
            expenseDate: date,
            note,
            ...(apiMode === "owner" ? { branchId } : {}),
          };

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
  const showImport = incomeCreate;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "แก้ไขรายการ" : "บันทึกรายการ"}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
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
                : incomeCreate
                  ? "กรอกยอดเงินสดและโอน — หรือกดนำเข้าจากรอบขาย"
                  : "เลือกรายรับหรือรายจ่าย แล้วกรอกข้อมูล"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200"
          >
            <IconClose size={18} />
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
                      setImportPanel(null);
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
            <div>
              <p className="text-xs font-medium text-gray-600">วันที่รายการ</p>
              <div className="mt-1 flex items-stretch gap-2">
                {showImport ? (
                  <button
                    type="button"
                    onClick={() => openImportFromShifts()}
                    disabled={Boolean(importPanel?.loading)}
                    className="shrink-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-700 shadow-sm active:scale-[0.98] disabled:opacity-60"
                  >
                    นำเข้า
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <DateInput
                    value={entryDate}
                    max={todayKey}
                    aria-label="วันที่รายการ"
                    onChange={(v) => {
                      if (!v) return;
                      setEntryDate(clampToToday(v));
                      setImportPanel(null);
                    }}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                  />
                </div>
              </div>
              {incomeCreate && form.importRound != null ? (
                <p className="mt-1 text-[11px] font-medium text-emerald-700">
                  จากรอบขายที่ {form.importRound}
                </p>
              ) : null}
            </div>

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
                  incomeCreate
                    ? "เช่น ยอดขาย"
                    : kind === "income"
                      ? "เช่น เงินทุนหมุนเวียน"
                      : "เช่น ก๊าซ / น้ำแข็ง"
                }
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
              />
            </label>

            {incomeCreate ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-gray-600">
                  เงินสด (บาท)
                  <input
                    inputMode="decimal"
                    value={form.cashAmount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cashAmount: e.target.value }))
                    }
                    placeholder="0"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-gray-900"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  โอน (บาท)
                  <input
                    inputMode="decimal"
                    value={form.transferAmount}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        transferAmount: e.target.value,
                      }))
                    }
                    placeholder="0"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-gray-900"
                  />
                </label>
              </div>
            ) : (
              <>
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
              </>
            )}

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

        {importPanel ? (
          <div
            className="absolute inset-0 z-10 flex flex-col rounded-t-2xl bg-white sm:rounded-2xl"
            role="dialog"
            aria-label="นำเข้ารายรับจากรอบขาย"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-base font-bold text-gray-900">
                  นำเข้าจากรอบขาย
                </p>
                <p className="text-xs text-gray-500">
                  เลือกวันและรอบ — ระบบจะกรอกยอดเงินสดกับโอนให้
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportPanel(null)}
                aria-label="ปิด"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <label className="block text-xs font-medium text-gray-600">
                วันที่รอบขาย
                <DateInput
                  value={importPanel.date}
                  max={todayKey}
                  aria-label="วันที่รอบขาย"
                  onChange={(v) => {
                    if (!v) return;
                    void loadImportPanelDate(clampToToday(v), {
                      allowYesterdayFallback: true,
                    });
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                />
              </label>

              {importPanel.notice ? (
                <p
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                  role="status"
                >
                  {importPanel.notice}
                </p>
              ) : null}

              {importPanel.loading ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  กำลังโหลดรอบขาย…
                </p>
              ) : importPanel.shifts.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  ไม่มีรอบขายให้เลือกในวันนี้
                </p>
              ) : (
                <div className="space-y-2">
                  {importPanel.shifts.map((shift) => (
                    <button
                      key={shift.id}
                      type="button"
                      disabled={importPanel.loading}
                      onClick={() =>
                        void applyShiftImport(shift, importPanel.date)
                      }
                      className="flex w-full items-start gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-white px-4 py-3.5 text-left shadow-sm active:scale-[0.99] disabled:opacity-60"
                    >
                      <span className="mt-0.5 flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-600 text-center text-white shadow-sm">
                        <span className="text-[9px] font-bold leading-none opacity-90">
                          รอบ
                        </span>
                        <span className="text-lg font-black leading-none tabular-nums">
                          {shift.roundNumber}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-extrabold text-slate-900">
                          รอบขายที่ {shift.roundNumber}
                        </span>
                        <span className="mt-1 block text-[12px] text-slate-500">
                          {formatHm(shift.openedAt)}
                          {shift.closedAt
                            ? ` – ${formatHm(shift.closedAt)}`
                            : " – เปิดอยู่"}
                          {" · "}
                          {shift.completedCount}/{shift.orderCount} บิล
                        </span>
                      </span>
                      <span className="shrink-0 pt-1 text-right text-[16px] font-black tabular-nums text-emerald-700">
                        ฿{formatPrice(shift.revenueBaht)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import {
  EXPENSE_QUICK_TITLES,
  PAY_CHANNEL_LABEL,
} from "@/lib/branch-expense-ui";
import type { OwnerBranchRow } from "@/lib/owner-dashboard";
import {
  buildOwnerViewQuery,
  ownerSummaryHref,
  readOwnerViewRangeParams,
} from "@/lib/owner-view-query";
import { formatOperatingDayLabel } from "@/lib/operating-day";

type PayChannel = "CASH" | "TRANSFER";

type ExpenseRow = {
  id: string;
  branchId: string;
  title: string;
  amount: number;
  payChannel: PayChannel;
  expenseDate: string;
  note: string | null;
  createdAt: string;
  branchName: string;
  createdByStaff: { name: string | null } | null;
  createdByAdmin: { username: string } | null;
};

type ExpensesPayload = {
  expenses: ExpenseRow[];
  summary: {
    count: number;
    total: number;
    cash: number;
    transfer: number;
  };
  branches: OwnerBranchRow[];
  hasTestBranch?: boolean;
};

type ExpenseForm = {
  branchId: string;
  title: string;
  amount: string;
  payChannel: PayChannel;
  expenseDate: string;
  note: string;
};

function emptyForm(branchId: string, expenseDate: string): ExpenseForm {
  return {
    branchId,
    title: "",
    amount: "",
    payChannel: "CASH",
    expenseDate,
    note: "",
  };
}

function formatExpenseWhen(dateKey: string, createdAt: string) {
  const day = formatOperatingDayLabel(dateKey) || dateKey;
  try {
    const time = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(createdAt));
    return `${day} · ${time}`;
  } catch {
    return day;
  }
}

function creatorLabel(row: ExpenseRow) {
  return (
    row.createdByStaff?.name ||
    row.createdByAdmin?.username ||
    null
  );
}

function OwnerExpensesInner() {
  const { data } = useOwnerDashboard();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initial = readOwnerViewRangeParams(searchParams, today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [datePreset, setDatePreset] = useState<MobileDatePresetId | null>(
    initial.hasRange
      ? (matchMobileDatePreset(initial.from, initial.to, today) ?? "custom")
      : "today",
  );
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initial.branchId,
  );
  const [payload, setPayload] = useState<ExpensesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseForm>(() =>
    emptyForm(initial.branchId ?? "", today),
  );
  const [saving, setSaving] = useState(false);
  const urlReady = useRef(false);
  const reloadToken = useRef(0);

  const writeViewQuery = useCallback(
    (next: {
      branchId?: string | null;
      from?: string;
      to?: string;
    }) => {
      const q = buildOwnerViewQuery({
        branchId:
          next.branchId !== undefined ? next.branchId : filterBranchId,
        from: next.from ?? from,
        to: next.to ?? to,
      });
      router.replace(`/owner/expenses${q}`, { scroll: false });
    },
    [filterBranchId, from, router, to],
  );

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    setFilterBranchId(parsed.branchId);
    if (parsed.hasRange) {
      setFrom(parsed.from);
      setTo(parsed.to);
      setDatePreset(
        matchMobileDatePreset(parsed.from, parsed.to, today) ?? "custom",
      );
    }
  }, [searchParams, today]);

  const reload = useCallback(async () => {
    const token = ++reloadToken.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (includeTest) params.set("includeTest", "1");
      if (filterBranchId) params.set("branchId", filterBranchId);
      const res = await fetch(`/api/owner/expenses?${params}`);
      if (!res.ok || token !== reloadToken.current) return;
      const json = (await res.json()) as ExpensesPayload;
      if (token !== reloadToken.current) return;
      setPayload(json);
    } finally {
      if (token === reloadToken.current) setLoading(false);
    }
  }, [from, to, filterBranchId, includeTest]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const summary = payload?.summary ?? {
    count: 0,
    total: 0,
    cash: 0,
    transfer: 0,
  };
  const expenses = payload?.expenses ?? [];
  const hasTestBranch =
    payload?.hasTestBranch ??
    data?.hasTestBranch ??
    (data?.branches ?? []).some((b) => b.isTest);
  const filterBranches = (payload?.branches ?? data?.branches ?? []).filter(
    (b) =>
      !b.isHidden &&
      b.kind !== "WAREHOUSE" &&
      (includeTest || !b.isTest),
  );
  const filterBranchName = filterBranchId
    ? filterBranches.find((b) => b.id === filterBranchId)?.name
    : null;
  const multiBranch = filterBranches.length > 1 && !filterBranchId;
  const summaryHref = ownerSummaryHref({
    branchId: filterBranchId,
    from,
    to,
  });
  const defaultBranchId =
    filterBranchId ?? filterBranches[0]?.id ?? "";

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm(defaultBranchId, today));
  }

  function openCreate() {
    if (!defaultBranchId) {
      toast.error("ยังไม่มีสาขาให้บันทึก");
      return;
    }
    setEditingId(null);
    setForm(emptyForm(defaultBranchId, to <= today ? to : today));
    setFormOpen(true);
  }

  function openEdit(row: ExpenseRow) {
    setEditingId(row.id);
    setForm({
      branchId: row.branchId,
      title: row.title,
      amount: String(row.amount),
      payChannel: row.payChannel,
      expenseDate: row.expenseDate,
      note: row.note ?? "",
    });
    setFormOpen(true);
  }

  async function submitForm() {
    const amount = Number(form.amount);
    if (!form.branchId) {
      toast.error("กรุณาเลือกสาขา");
      return;
    }
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
      const body = {
        title: form.title.trim(),
        amount,
        payChannel: form.payChannel,
        expenseDate: form.expenseDate,
        note: form.note.trim() || null,
      };
      const res = await fetch(
        editingId
          ? `/api/admin/branches/${form.branchId}/expenses/${editingId}`
          : `/api/admin/branches/${form.branchId}/expenses`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          (json as { error?: string }).error || "บันทึกไม่สำเร็จ",
        );
        return;
      }
      toast.success(editingId ? "แก้ไขแล้ว" : "บันทึกค่าใช้จ่ายแล้ว");
      closeForm();
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(row: ExpenseRow) {
    const ok = await confirm({
      title: "ลบค่าใช้จ่าย?",
      message: `ลบรายการ “${row.title}” ออกจากระบบ`,
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/branches/${row.branchId}/expenses/${row.id}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((json as { error?: string }).error || "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบแล้ว");
    if (editingId === row.id) closeForm();
    await reload();
  }

  return (
    <div className="px-4 pb-24 pt-4">
      <header className="mb-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-rose-600/80">
          Owner · ค่าใช้จ่าย
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-black text-slate-900">
              ค่าใช้จ่าย
            </h1>
            <p className="mt-1 text-[14px] font-medium text-slate-500">
              ดู · เพิ่ม · แก้ไข ตามช่วงวันที่เลือก
              {hasTestBranch && !includeTest ? " · ไม่รวมสาขาทดลอง" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="shrink-0 rounded-full bg-rose-600 px-3.5 py-2 text-[13px] font-extrabold text-white shadow-sm active:bg-rose-700"
          >
            + เพิ่ม
          </button>
        </div>
      </header>

      {hasTestBranch ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => setIncludeTest(e.target.checked)}
          />
          รวมข้อมูลสาขาทดลอง
        </label>
      ) : null}

      <MobileDateRangeControl
        todayKey={today}
        from={from}
        to={to}
        preset={datePreset}
        maxDate={today}
        onChange={({ from: nextFrom, to: nextTo, preset }) => {
          setDatePreset(preset);
          setFrom(nextFrom);
          setTo(nextTo);
          writeViewQuery({ from: nextFrom, to: nextTo });
        }}
        trailing={
          <OwnerBranchFilterBar
            branches={filterBranches}
            value={filterBranchId}
            onChange={(id) => {
              setFilterBranchId(id);
              writeViewQuery({ branchId: id });
            }}
          />
        }
      />

      {filterBranchName ? (
        <p className="mb-3 text-[13px] font-semibold text-emerald-800">
          กำลังดูสาขา · {filterBranchName}
        </p>
      ) : null}

      <section
        className={`mb-3 grid grid-cols-3 gap-2 ${loading ? "opacity-70" : ""}`}
        aria-label="สรุปค่าใช้จ่าย"
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
          <p className="text-[11px] font-bold text-rose-800">รวม</p>
          <p className="mt-1 text-[18px] font-black tabular-nums leading-tight text-rose-950">
            ฿{formatPrice(summary.total)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-rose-700/80">
            {formatPrice(summary.count)} รายการ
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
          <p className="text-[11px] font-bold text-rose-800">เงินสด</p>
          <p className="mt-1 text-[18px] font-black tabular-nums leading-tight text-rose-950">
            ฿{formatPrice(summary.cash)}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
          <p className="text-[11px] font-bold text-rose-800">โอน</p>
          <p className="mt-1 text-[18px] font-black tabular-nums leading-tight text-rose-950">
            ฿{formatPrice(summary.transfer)}
          </p>
        </div>
      </section>

      <section
        className={`overflow-hidden rounded-2xl border border-rose-200/80 bg-white shadow-sm ${
          loading ? "opacity-70" : ""
        }`}
        aria-label="รายการค่าใช้จ่าย"
      >
        <div className="border-b border-rose-100 px-4 py-3">
          <h2 className="text-[15px] font-extrabold text-slate-900">
            รายการทั้งหมด
          </h2>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
            กดรายการเพื่อแก้ไข · เรียงใหม่ไปเก่า
          </p>
        </div>

        {expenses.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-slate-400">
              {loading ? "กำลังโหลด…" : "ไม่มีค่าใช้จ่ายในช่วงนี้"}
            </p>
            {!loading ? (
              <button
                type="button"
                onClick={openCreate}
                className="mt-3 text-[13px] font-bold text-rose-700"
              >
                + เพิ่มรายการแรก
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-rose-50">
            {expenses.map((row) => {
              const who = creatorLabel(row);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left active:bg-rose-50/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-slate-900">
                        {row.title}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                        {formatExpenseWhen(row.expenseDate, row.createdAt)}
                        {" · "}
                        {PAY_CHANNEL_LABEL[row.payChannel]}
                        {multiBranch || filterBranches.length > 1
                          ? ` · ${row.branchName}`
                          : ""}
                        {who ? ` · ${who}` : ""}
                      </p>
                      {row.note ? (
                        <p className="mt-1 text-[12px] font-medium text-slate-600">
                          {row.note}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-black tabular-nums text-rose-800">
                        ฿{formatPrice(row.amount)}
                      </p>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                        แก้ไข ›
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-4 text-center text-[12px] font-medium text-slate-400">
        <Link href={summaryHref} className="font-bold text-slate-600">
          ← กลับภาพรวมร้าน
        </Link>
      </p>

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? "แก้ไขค่าใช้จ่าย" : "เพิ่มค่าใช้จ่าย"}
          onClick={closeForm}
        >
          <div
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[16px] font-extrabold text-slate-900">
                  {editingId ? "แก้ไขค่าใช้จ่าย" : "เพิ่มค่าใช้จ่าย"}
                </p>
                <p className="text-[12px] font-medium text-slate-500">
                  บันทึกเข้าสาขาที่เลือก
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full px-3 py-1.5 text-[13px] font-bold text-slate-500"
              >
                ปิด
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {filterBranches.length > 1 ? (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold text-slate-500">
                    สาขา
                  </span>
                  <select
                    value={form.branchId}
                    disabled={saving || Boolean(editingId)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, branchId: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] font-bold text-slate-900 outline-none focus:border-rose-400"
                  >
                    {filterBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {editingId ? (
                    <p className="mt-1 text-[11px] font-medium text-slate-400">
                      แก้ไขรายการเดิม — ย้ายสาขาไม่ได้
                    </p>
                  ) : null}
                </label>
              ) : null}

              <div>
                <p className="mb-1.5 text-[12px] font-bold text-slate-500">
                  รายการด่วน
                </p>
                <div className="flex flex-wrap gap-1.5">
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
                      className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${
                        form.title === t
                          ? "bg-rose-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-slate-500">
                  ชื่อรายการ
                </span>
                <input
                  value={form.title}
                  disabled={saving}
                  placeholder="เช่น ก๊าซ, น้ำแข็ง"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-[15px] font-bold text-slate-900 outline-none focus:border-rose-400"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold text-slate-500">
                    จำนวนเงิน
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={form.amount}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-[15px] font-bold tabular-nums text-slate-900 outline-none focus:border-rose-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold text-slate-500">
                    วันที่
                  </span>
                  <DateInput
                    value={form.expenseDate}
                    max={today}
                    disabled={saving}
                    onChange={(v) => {
                      if (v) setForm((f) => ({ ...f, expenseDate: v }));
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-[15px] font-bold text-slate-900"
                  />
                </label>
              </div>

              <div>
                <p className="mb-1.5 text-[12px] font-bold text-slate-500">
                  ช่องทางชำระ
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["CASH", "TRANSFER"] as const).map((ch) => {
                    const active = form.payChannel === ch;
                    return (
                      <button
                        key={ch}
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          setForm((f) => ({ ...f, payChannel: ch }))
                        }
                        className={`rounded-xl py-3 text-[13px] font-extrabold ${
                          active
                            ? "bg-rose-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {PAY_CHANNEL_LABEL[ch]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-slate-500">
                  หมายเหตุ (ถ้ามี)
                </span>
                <textarea
                  value={form.note}
                  disabled={saving}
                  rows={2}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value }))
                  }
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-[14px] font-medium text-slate-800 outline-none focus:border-rose-400"
                />
              </label>
            </div>

            <div className="space-y-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitForm()}
                className="w-full rounded-2xl bg-rose-600 py-3.5 text-[15px] font-extrabold text-white active:bg-rose-700 disabled:opacity-60"
              >
                {saving
                  ? "กำลังบันทึก…"
                  : editingId
                    ? "บันทึกการแก้ไข"
                    : "บันทึกรายการ"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    const row = expenses.find((e) => e.id === editingId);
                    if (row) void removeExpense(row);
                  }}
                  className="w-full rounded-2xl py-3 text-[14px] font-bold text-rose-700 active:bg-rose-50 disabled:opacity-60"
                >
                  ลบรายการนี้
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OwnerExpensesPage() {
  return (
    <OwnerAppShell active="summary">
      <OwnerExpensesInner />
    </OwnerAppShell>
  );
}

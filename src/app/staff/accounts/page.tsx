"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffExpensesSheet } from "@/components/staff/StaffExpensesSheet";
import { StaffIncomesSheet } from "@/components/staff/StaffIncomesSheet";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { IconCash, IconReceipt, IconWallet } from "@/components/icons";
import {
  bangkokDateKey,
  bangkokMonthRangeToToday,
  formatPrice,
  isBangkokDateKey,
} from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";

type ChannelSummary = {
  count: number;
  total: number;
  cash: number;
  transfer: number;
};

type AccountsSummary = {
  from: string;
  to: string;
  income: ChannelSummary;
  expense: ChannelSummary;
  net: number;
  cashNet: number;
  transferNet: number;
};

function rangeLabel(from: string, to: string) {
  const a = formatOperatingDayLabel(from) || from;
  const b = formatOperatingDayLabel(to) || to;
  return from === to ? a : `${a} – ${b}`;
}

export default function StaffAccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const monthRange = bangkokMonthRangeToToday();
  const [dateFrom, setDateFrom] = useState(monthRange.from);
  const [dateTo, setDateTo] = useState(monthRange.to);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "income") setIncomeOpen(true);
    if (tab === "expense" || tab === "expenses") setExpenseOpen(true);
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateFrom <= dateTo ? dateFrom : dateTo;
      const to = dateFrom <= dateTo ? dateTo : dateFrom;
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/staff/accounts/summary?${params}`);
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "โหลดภาพรวมบัญชีไม่สำเร็จ");
        return;
      }
      setSummary(body as AccountsSummary);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, router, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const from = dateFrom <= dateTo ? dateFrom : dateTo;
  const to = dateFrom <= dateTo ? dateTo : dateFrom;
  const income = summary?.income ?? { count: 0, total: 0, cash: 0, transfer: 0 };
  const expense = summary?.expense ?? {
    count: 0,
    total: 0,
    cash: 0,
    transfer: 0,
  };
  const net = summary?.net ?? 0;

  return (
    <StaffAppShell active="home">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pb-8 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-slate-900">บัญชี</p>
            <p className="text-xs font-medium text-slate-500">
              รายรับ · รายจ่าย · ภาพรวม (แยกจากยอดขาย)
            </p>
          </div>
          <Link
            href="/staff"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            กลับหน้าหลัก
          </Link>
        </div>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <IconWallet size={18} />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">ภาพรวมบัญชี</p>
              <p className="text-[11px] font-medium text-slate-500">
                {rangeLabel(from, to)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-gray-600">
              วันที่เริ่ม
              <DateInput
                value={dateFrom}
                max={dateTo}
                aria-label="วันที่เริ่ม"
                onChange={(v) => {
                  if (v && isBangkokDateKey(v)) setDateFrom(v);
                }}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              วันที่สิ้นสุด
              <DateInput
                value={dateTo}
                min={dateFrom}
                aria-label="วันที่สิ้นสุด"
                onChange={(v) => {
                  if (v && isBangkokDateKey(v)) setDateTo(v);
                }}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
              />
            </label>
          </div>

          {loading && !summary ? (
            <p className="py-6 text-center text-sm text-slate-500">กำลังโหลด…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-600 px-3 py-2.5 text-white">
                <p className="text-[11px] font-medium text-white/85">รายรับ</p>
                <p className="mt-0.5 text-xl font-black tabular-nums">
                  {formatPrice(income.total)}฿
                </p>
                <p className="mt-0.5 text-[11px] text-white/80">
                  {income.count} รายการ
                </p>
              </div>
              <div className="rounded-xl bg-rose-600 px-3 py-2.5 text-white">
                <p className="text-[11px] font-medium text-white/85">รายจ่าย</p>
                <p className="mt-0.5 text-xl font-black tabular-nums">
                  {formatPrice(expense.total)}฿
                </p>
                <p className="mt-0.5 text-[11px] text-white/80">
                  {expense.count} รายการ
                </p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">
                  คงเหลือ (รับ − จ่าย)
                </p>
                <p
                  className={`mt-0.5 text-xl font-black tabular-nums ${
                    net >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {formatPrice(net)}฿
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  เงินสด {formatPrice(summary?.cashNet ?? 0)}฿ · โอน{" "}
                  {formatPrice(summary?.transferNet ?? 0)}฿
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setIncomeOpen(true)}
            className="min-h-[6.5rem] rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <IconCash size={18} />
            </span>
            <p className="mt-3 text-base font-extrabold text-emerald-900">
              รายรับ
            </p>
            <p className="mt-0.5 text-xs font-medium text-emerald-800/80">
              บันทึกยอดรับเข้า
            </p>
          </button>
          <button
            type="button"
            onClick={() => setExpenseOpen(true)}
            className="min-h-[6.5rem] rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-left active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white">
              <IconReceipt size={18} />
            </span>
            <p className="mt-3 text-base font-extrabold text-rose-900">
              รายจ่าย
            </p>
            <p className="mt-0.5 text-xs font-medium text-rose-800/80">
              บันทึกยอดจ่ายออก
            </p>
          </button>
        </section>
      </div>

      <StaffIncomesSheet
        open={incomeOpen}
        onClose={() => {
          setIncomeOpen(false);
          if (searchParams.get("tab") === "income") {
            router.replace("/staff/accounts");
          }
        }}
        initialDate={bangkokDateKey()}
        onChanged={() => void load()}
      />
      <StaffExpensesSheet
        open={expenseOpen}
        onClose={() => {
          setExpenseOpen(false);
          const tab = searchParams.get("tab");
          if (tab === "expense" || tab === "expenses") {
            router.replace("/staff/accounts");
          }
        }}
        initialDate={bangkokDateKey()}
        onChanged={() => void load()}
      />
    </StaffAppShell>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  StaffAccountEntrySheet,
  type AccountEntryApiMode,
  type AccountEntryEdit,
  type AccountEntryKind,
} from "@/components/staff/StaffAccountEntrySheet";
import {
  ShareExportMenu,
  type ShareExportAction,
} from "@/components/staff/ShareExportMenu";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  MobileDateRangeControl,
  mobileRangeForPreset,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import {
  IconBack,
  IconClose,
  IconEdit,
  IconShare,
  IconTrash,
  IconWallet,
} from "@/components/icons";
import { PAY_CHANNEL_LABEL } from "@/lib/branch-expense-ui";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";
import {
  captureElementToPng,
  downloadPngDataUrl,
  sharePlainText,
  sharePngDataUrl,
} from "@/lib/share-media";

type ChannelSummary = {
  count: number;
  total: number;
  cash: number;
  transfer: number;
};

export type LedgerEntry = {
  kind: AccountEntryKind;
  id: string;
  title: string;
  amount: number;
  payChannel: "CASH" | "TRANSFER";
  date: string;
  note: string | null;
  createdAt: string;
  createdByStaff: { name: string | null } | null;
  createdByAdmin: { username: string } | null;
};

type AccountsSummary = {
  from: string;
  to: string;
  income: ChannelSummary;
  expense: ChannelSummary;
  net: number;
  cashNet: number;
  transferNet: number;
  entries: LedgerEntry[];
};

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

function rangeLabel(from: string, to: string) {
  const a = formatOperatingDayLabel(from) || from;
  const b = formatOperatingDayLabel(to) || to;
  return from === to ? a : `${a} – ${b}`;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("copy failed");
}

export type AccountsLedgerViewProps = {
  apiMode: AccountEntryApiMode;
  /** Required for owner; ignored for staff */
  branchId?: string;
  backHref: string;
  brandName?: string;
  branchName?: string;
  /** When set, show “เปลี่ยนสาขา” link (multi-branch owner) */
  changeBranchHref?: string | null;
  loginRedirect: string;
  /** Path to clear ?tab= after closing sheet */
  accountsPath: string;
  /** Optional wrapper (StaffAppShell / OwnerAppShell) */
  wrap?: (content: ReactNode) => ReactNode;
  /** Extra bottom padding for owner shell tab bar */
  bottomPadClassName?: string;
  fabBottomClassName?: string;
};

export function AccountsLedgerView({
  apiMode,
  branchId,
  backHref,
  brandName: brandNameProp = "",
  branchName: branchNameProp = "",
  changeBranchHref = null,
  loginRedirect,
  accountsPath,
  wrap,
  bottomPadClassName = "pb-36",
  fabBottomClassName = "bottom-[4.75rem]",
}: AccountsLedgerViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { confirm } = useConfirm();
  const captureRef = useRef<HTMLDivElement>(null);
  const todayKey = bangkokDateKey();
  const initialRange = mobileRangeForPreset("today", todayKey);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [preset, setPreset] = useState<MobileDatePresetId>("today");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createKind, setCreateKind] = useState<AccountEntryKind>("expense");
  const [editEntry, setEditEntry] = useState<AccountEntryEdit | null>(null);
  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);
  const [brandName, setBrandName] = useState(brandNameProp);
  const [branchName, setBranchName] = useState(branchNameProp);
  const [exportBusy, setExportBusy] = useState<ShareExportAction | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [captureHeaderVisible, setCaptureHeaderVisible] = useState(false);

  useEffect(() => {
    setBrandName(brandNameProp);
  }, [brandNameProp]);

  useEffect(() => {
    setBranchName(branchNameProp);
  }, [branchNameProp]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "income") {
      setCreateKind("income");
      setEditEntry(null);
      setSheetOpen(true);
    } else if (tab === "expense" || tab === "expenses") {
      setCreateKind("expense");
      setEditEntry(null);
      setSheetOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (apiMode !== "staff") return;
    fetch("/api/staff/branding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setBrandName(String(data.brand?.name ?? "").trim());
        setBranchName(String(data.branchName ?? "").trim());
      })
      .catch(() => {});
  }, [apiMode]);

  const load = useCallback(async () => {
    if (apiMode === "owner" && !branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const from = dateFrom <= dateTo ? dateFrom : dateTo;
      const to = dateFrom <= dateTo ? dateTo : dateFrom;
      const params = new URLSearchParams({ from, to });
      if (apiMode === "owner" && branchId) {
        params.set("branchId", branchId);
      }
      const prefix = apiMode === "owner" ? "/api/owner" : "/api/staff";
      const res = await fetch(`${prefix}/accounts/summary?${params}`);
      if (res.status === 401) {
        router.replace(loginRedirect);
        return;
      }
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.redirect) {
          router.replace(String(body.redirect));
          return;
        }
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "โหลดบัญชีไม่สำเร็จ");
        return;
      }
      if (apiMode === "owner") {
        if (body.brandName) setBrandName(String(body.brandName).trim());
        if (body.branchName) setBranchName(String(body.branchName).trim());
      }
      setSummary({
        ...(body as AccountsSummary),
        entries: Array.isArray(body.entries) ? body.entries : [],
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [apiMode, branchId, dateFrom, dateTo, loginRedirect, router, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditEntry(null);
    setCreateKind("expense");
    setSheetOpen(true);
  }

  function openEdit(row: LedgerEntry) {
    setDetailEntry(null);
    setEditEntry({
      kind: row.kind,
      id: row.id,
      title: row.title,
      amount: row.amount,
      payChannel: row.payChannel,
      date: row.date,
      note: row.note,
    });
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditEntry(null);
    const tab = searchParams.get("tab");
    if (tab === "income" || tab === "expense" || tab === "expenses") {
      router.replace(accountsPath);
    }
  }

  async function remove(row: LedgerEntry) {
    const label = row.kind === "income" ? "รายรับ" : "รายจ่าย";
    const ok = await confirm({
      title: `ลบ${label}?`,
      message: `รายการ “${row.title}” จะถูกลบออกจากระบบ และกู้คืนไม่ได้`,
      confirmLabel: "ลบรายการ",
      cancelLabel: "ยกเลิก",
      tone: "danger",
    });
    if (!ok) return;
    const prefix = apiMode === "owner" ? "/api/owner" : "/api/staff";
    const base =
      row.kind === "income" ? `${prefix}/incomes` : `${prefix}/expenses`;
    const res = await fetch(`${base}/${row.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบแล้ว");
    if (detailEntry?.id === row.id && detailEntry.kind === row.kind) {
      setDetailEntry(null);
    }
    await load();
  }

  function buildEntryShareText(row: LedgerEntry) {
    const kindLabel = row.kind === "income" ? "รายรับ" : "รายจ่าย";
    const sign = row.kind === "income" ? "+" : "-";
    const lines: string[] = [];
    if (brandName) lines.push(brandName);
    if (branchName) lines.push(`สาขา ${branchName}`);
    lines.push(`${kindLabel}: ${row.title}`);
    lines.push(`จำนวน: ${sign}${formatPrice(row.amount)} บาท`);
    lines.push(`วันที่: ${formatOperatingDayLabel(row.date) || row.date}`);
    lines.push(`ช่องทาง: ${PAY_CHANNEL_LABEL[row.payChannel]}`);
    if (row.note?.trim()) lines.push(`หมายเหตุ: ${row.note.trim()}`);
    if (row.createdByStaff?.name) {
      lines.push(`ผู้บันทึก: ${row.createdByStaff.name}`);
    } else if (row.createdByAdmin?.username) {
      lines.push(`ผู้บันทึก: แอดมิน ${row.createdByAdmin.username}`);
    }
    return lines.join("\n");
  }

  async function shareEntry(row: LedgerEntry) {
    const kindLabel = row.kind === "income" ? "รายรับ" : "รายจ่าย";
    const title = [brandName, branchName ? `สาขา ${branchName}` : "", kindLabel]
      .filter(Boolean)
      .join(" · ");
    const r = await sharePlainText({
      title,
      text: buildEntryShareText(row),
    });
    if (r.error === "cancelled") return;
    if (r.ok) {
      toast.success(
        r.mode === "copy" ? "คัดลอกรายการแล้ว" : "แชร์รายการแล้ว",
      );
      return;
    }
    toast.error(r.error || "แชร์ไม่สำเร็จ");
  }

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
  const entries = summary?.entries ?? [];
  const periodLabel = rangeLabel(from, to);

  function buildCopyText() {
    const lines: string[] = [];
    if (brandName) lines.push(brandName);
    if (branchName) lines.push(`สาขา ${branchName}`);
    lines.push(`บัญชี · ${periodLabel}`);
    lines.push(`รายรับ: ${formatPrice(income.total)} บาท (${income.count} รายการ)`);
    lines.push(
      `  เงินสด ${formatPrice(income.cash)} · โอน ${formatPrice(income.transfer)}`,
    );
    lines.push(
      `รายจ่าย: ${formatPrice(expense.total)} บาท (${expense.count} รายการ)`,
    );
    lines.push(
      `  เงินสด ${formatPrice(expense.cash)} · โอน ${formatPrice(expense.transfer)}`,
    );
    lines.push(`คงเหลือ: ${formatPrice(net)} บาท`);
    lines.push(
      `เงินสดสุทธิ: ${formatPrice(summary?.cashNet ?? 0)} บาท · โอนสุทธิ: ${formatPrice(summary?.transferNet ?? 0)} บาท`,
    );
    if (entries.length > 0) {
      lines.push("");
      lines.push("รายการ:");
      for (const row of entries) {
        const sign = row.kind === "income" ? "+" : "-";
        const kindLabel = row.kind === "income" ? "รายรับ" : "รายจ่าย";
        lines.push(
          `- [${kindLabel}] ${row.title} · ${formatOperatingDayLabel(row.date) || row.date} · ${PAY_CHANNEL_LABEL[row.payChannel]} · ${sign}${formatPrice(row.amount)} บาท`,
        );
        if (row.note?.trim()) lines.push(`  หมายเหตุ: ${row.note.trim()}`);
      }
    }
    return lines.join("\n");
  }

  function exportFilename() {
    return from === to
      ? `บัญชี_${from}.png`
      : `บัญชี_${from}_${to}.png`;
  }

  async function capturePng() {
    const node = captureRef.current;
    if (!node) throw new Error("ไม่พบเนื้อหาบัญชี");
    flushSync(() => setCaptureHeaderVisible(true));
    try {
      return await captureElementToPng(node);
    } finally {
      setCaptureHeaderVisible(false);
    }
  }

  async function handleSaveImage() {
    if (exportBusy || !captureRef.current) return;
    setExportBusy("save");
    setExportMsg("");
    try {
      const dataUrl = await capturePng();
      const r = await downloadPngDataUrl(dataUrl, exportFilename());
      setExportMsg(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกรูปไม่สำเร็จ");
    } catch {
      setExportMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleShareImage() {
    if (exportBusy || !captureRef.current) return;
    setExportBusy("share");
    setExportMsg("");
    try {
      const dataUrl = await capturePng();
      const title = [brandName, branchName ? `สาขา ${branchName}` : "", "บัญชี"]
        .filter(Boolean)
        .join(" · ");
      const r = await sharePngDataUrl(dataUrl, exportFilename(), title);
      if (r.error === "cancelled") {
        setExportMsg("");
      } else if (r.ok) {
        setExportMsg("แชร์รูปแล้ว");
      } else {
        setExportMsg(r.error ?? "แชร์รูปไม่สำเร็จ");
      }
    } catch {
      setExportMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleCopyText() {
    if (exportBusy) return;
    setExportBusy("copy");
    setExportMsg("");
    try {
      await copyTextToClipboard(buildCopyText());
      setExportMsg("คัดลอกข้อความแล้ว");
    } catch {
      setExportMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setExportBusy(null);
    }
  }

  const content = (
    <>
      <div
        className={`mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pt-3 ${bottomPadClassName}`}
      >
        <div className="flex items-start gap-2">
          <Link
            href={backHref}
            aria-label="กลับ"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <IconBack size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <MobileDateRangeControl
              todayKey={todayKey}
              from={dateFrom}
              to={dateTo}
              preset={preset}
              onChange={({ from: nextFrom, to: nextTo, preset: nextPreset }) => {
                setDateFrom(nextFrom);
                setDateTo(nextTo);
                setPreset(nextPreset);
              }}
              trailing={
                <ShareExportMenu
                  busy={exportBusy}
                  message={exportMsg}
                  disabled={loading && !summary}
                  sheetTitle="แชร์บัญชี"
                  sheetHint="แชร์รูปภาพรวม หรือคัดลอกข้อความรายการ"
                  onShareImage={handleShareImage}
                  onSaveImage={handleSaveImage}
                  onCopyText={handleCopyText}
                />
              }
            />
          </div>
        </div>

        {apiMode === "owner" && (branchName || changeBranchHref) ? (
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="min-w-0">
              {brandName ? (
                <p className="truncate text-xs font-semibold text-slate-500">
                  {brandName}
                </p>
              ) : null}
              {branchName ? (
                <p className="truncate text-sm font-extrabold text-slate-900">
                  สาขา {branchName}
                </p>
              ) : null}
            </div>
            {changeBranchHref ? (
              <Link
                href={changeBranchHref}
                className="shrink-0 text-xs font-bold text-site-primary"
              >
                เปลี่ยนสาขา
              </Link>
            ) : null}
          </div>
        ) : null}

        {exportMsg ? (
          <p className="text-[12px] font-semibold text-site-primary">{exportMsg}</p>
        ) : null}

        <div ref={captureRef} className="space-y-3 bg-[#f5f5f7]">
          {captureHeaderVisible ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              {brandName ? (
                <p className="text-sm font-extrabold text-slate-900">{brandName}</p>
              ) : null}
              {branchName ? (
                <p className="text-xs font-semibold text-slate-600">
                  สาขา {branchName}
                </p>
              ) : null}
              <p className="text-xs font-medium text-slate-500">
                บัญชี · {periodLabel}
              </p>
            </div>
          ) : null}

          {loading && !summary ? (
            <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด…</p>
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
                <p className="mt-1 text-[10px] font-semibold leading-snug text-white/85">
                  เงินสด {formatPrice(income.cash)}฿
                  <span className="mx-1 opacity-60">·</span>
                  โอน {formatPrice(income.transfer)}฿
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
                <p className="mt-1 text-[10px] font-semibold leading-snug text-white/85">
                  เงินสด {formatPrice(expense.cash)}฿
                  <span className="mx-1 opacity-60">·</span>
                  โอน {formatPrice(expense.transfer)}฿
                </p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
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

          <section>
            <p className="mb-1.5 text-xs font-semibold text-gray-700">
              ประวัติรายการ
            </p>
            {loading && !summary ? null : entries.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-site-primary-soft text-site-primary">
                  <IconWallet size={28} />
                </span>
                <p className="mt-3 text-sm font-bold text-slate-700">
                  ยังไม่มีรายการในช่วงนี้
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  กดบันทึกรายการด้านล่างเพื่อเพิ่มรายรับหรือรายจ่าย
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {entries.map((row) => {
                  const isIncome = row.kind === "income";
                  return (
                    <li key={`${row.kind}-${row.id}`} className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDetailEntry(row)}
                        className="flex w-full items-start justify-between gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isIncome
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {isIncome ? "รายรับ" : "รายจ่าย"}
                            </span>
                            <p className="truncate text-sm font-medium text-gray-900">
                              {row.title}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                            {formatOperatingDayLabel(row.date) || row.date}
                            {` · ${PAY_CHANNEL_LABEL[row.payChannel]}`}
                            {formatTimeTh(row.createdAt)
                              ? ` · ${formatTimeTh(row.createdAt)} น.`
                              : ""}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-bold tabular-nums ${
                            isIncome ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {isIncome ? "+" : "−"}
                          {formatPrice(row.amount)}฿
                        </p>
                      </button>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailEntry(row)}
                          className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700"
                        >
                          รายละเอียด
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700"
                        >
                          <IconEdit size={12} />
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => void shareEntry(row)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700"
                        >
                          <IconShare size={12} />
                          แชร์
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(row)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700"
                        >
                          <IconTrash size={12} />
                          ลบ
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div
        className={`fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85 ${fabBottomClassName}`}
      >
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            onClick={openCreate}
            className="w-full rounded-xl bg-site-primary py-3 text-sm font-extrabold text-white shadow-sm active:scale-[0.99]"
          >
            บันทึกรายการ
          </button>
        </div>
      </div>

      <StaffAccountEntrySheet
        open={sheetOpen}
        onClose={closeSheet}
        initialKind={createKind}
        edit={editEntry}
        onSaved={() => void load()}
        apiMode={apiMode}
        branchId={branchId}
      />

      {detailEntry ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="รายละเอียดรายการ"
          onClick={() => setDetailEntry(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-base font-bold text-gray-900">รายละเอียด</p>
                <p className="text-xs text-gray-500">
                  {detailEntry.kind === "income" ? "รายรับ" : "รายจ่าย"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailEntry(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      detailEntry.kind === "income"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {detailEntry.kind === "income" ? "รายรับ" : "รายจ่าย"}
                  </span>
                  <p className="mt-1.5 text-lg font-extrabold text-slate-900">
                    {detailEntry.title}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-xl font-black tabular-nums ${
                    detailEntry.kind === "income"
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  {detailEntry.kind === "income" ? "+" : "−"}
                  {formatPrice(detailEntry.amount)}฿
                </p>
              </div>
              <dl className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">วันที่</dt>
                  <dd className="font-semibold text-slate-900">
                    {formatOperatingDayLabel(detailEntry.date) ||
                      detailEntry.date}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">ช่องทาง</dt>
                  <dd className="font-semibold text-slate-900">
                    {PAY_CHANNEL_LABEL[detailEntry.payChannel]}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">เวลาบันทึก</dt>
                  <dd className="font-semibold text-slate-900">
                    {formatTimeTh(detailEntry.createdAt)
                      ? `${formatTimeTh(detailEntry.createdAt)} น.`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">ผู้บันทึก</dt>
                  <dd className="font-semibold text-slate-900">
                    {detailEntry.createdByStaff?.name ||
                      (detailEntry.createdByAdmin?.username
                        ? `แอดมิน ${detailEntry.createdByAdmin.username}`
                        : "—")}
                  </dd>
                </div>
                {detailEntry.note ? (
                  <div>
                    <dt className="font-medium text-slate-500">หมายเหตุ</dt>
                    <dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-900">
                      {detailEntry.note}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => void shareEntry(detailEntry)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-800"
              >
                <IconShare size={16} />
                แชร์
              </button>
              <button
                type="button"
                onClick={() => openEdit(detailEntry)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-800"
              >
                <IconEdit size={16} />
                แก้ไข
              </button>
              <button
                type="button"
                onClick={() => void remove(detailEntry)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-50 py-3 text-sm font-bold text-red-700"
              >
                <IconTrash size={16} />
                ลบ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  return wrap ? <>{wrap(content)}</> : content;
}

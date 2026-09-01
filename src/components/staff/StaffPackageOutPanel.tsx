"use client";

import { useCallback, useRef, useState } from "react";
import { IconQrScan } from "@/components/icons";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { StaffQrCameraScanner } from "@/components/staff/StaffQrCameraScanner";
import {
  fetchPackageLabelPreview,
  type StockLabelScanPreview,
} from "@/lib/stock-label-scan";

type Props = {
  onBack: () => void;
};

export function StaffPackageOutPanel({ onBack }: Props) {
  const toast = useToast();
  const [scanValue, setScanValue] = useState("");
  const [preview, setPreview] = useState<StockLabelScanPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setLoading(true);
      try {
        const body = await fetchPackageLabelPreview("package-out", trimmed);
        setPreview(body);
      } catch (e) {
        setPreview(null);
        toast.error(
          "ค้นหาไม่สำเร็จ",
          e instanceof Error ? e.message : "ไม่พบรายการ",
        );
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  async function confirmIssue() {
    if (!preview) return;
    if (!note.trim()) {
      toast.error("กรุณากรอกรายละเอียดการจ่ายออก");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/staff/stock/package-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelId: preview.id,
          labelCode: preview.labelCode,
          qrPayload: preview.qrPayload,
          note: note.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "จ่ายออกไม่สำเร็จ",
        );
      }
      toast.success(
        "จ่ายรายการสำเร็จ",
        `${preview.productName} · ${preview.quantity} ${preview.unit}`,
      );
      setPreview(null);
      setScanValue("");
      setNote("");
    } catch (e) {
      toast.error(
        "จ่ายออกไม่สำเร็จ",
        e instanceof Error ? e.message : "ลองใหม่",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleScanned(value: string) {
    setScannerOpen(false);
    setScanValue(value);
    void lookup(value);
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 shrink-0 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
        >
          ← กลับ
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900">จ่ายออกรายการ</h2>
          <p className="text-xs font-semibold text-slate-500">
            สแกน QR เพื่อจ่ายออกจากคลัง
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            disabled={loading}
            className="group flex w-full flex-col items-center gap-4 px-6 py-10 transition active:scale-[0.99] disabled:opacity-60"
          >
            <span className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-site-primary/15 to-orange-100 text-site-primary shadow-inner ring-1 ring-site-primary/20 transition group-active:scale-95">
              <IconQrScan size={52} aria-hidden />
            </span>
            <span className="text-center">
              <span className="block text-[20px] font-extrabold text-slate-900">
                สแกน QR CODE
              </span>
              <span className="mt-1 block text-[13px] font-medium text-slate-500">
                แตะเพื่อเปิดกล้องสแกน
              </span>
            </span>
            <span className="w-full max-w-xs rounded-2xl bg-site-primary py-4 text-center text-[15px] font-extrabold text-white shadow-md shadow-orange-200/60">
              เปิดกล้องสแกน
            </span>
          </button>
        </section>

        <div className="flex items-center gap-3 px-1">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
            หรือ
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(scanValue);
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                กรอกรหัส
              </span>
              <input
                ref={inputRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="พิมพ์รหัส"
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:border-site-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-site-primary/20 disabled:opacity-60"
                autoComplete="off"
                inputMode="text"
              />
            </label>
            <p className="mt-2 text-[11px] font-medium leading-relaxed text-slate-500">
              จ่ายออกรายการจากสต๊อกคลัง — สาขาปลายทางจะรับเข้าด้วยรหัสเดียวกัน
            </p>
            <button
              type="submit"
              disabled={loading || !scanValue.trim()}
              className="mt-4 w-full rounded-xl border-2 border-slate-200 bg-white py-3 text-[14px] font-extrabold text-slate-800 transition hover:border-slate-300 disabled:opacity-50"
            >
              {loading ? "กำลังค้นหา…" : "ค้นหา"}
            </button>
          </form>
        </section>

        {loading ? <LoadingState label="กำลังค้นหา…" /> : null}

        {preview ? (
          <section className="space-y-3 rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4 shadow-sm">
            <div>
              <p className="text-[13px] font-bold text-amber-700">
                {preview.status === "ACTIVE"
                  ? "พร้อมจ่ายออก"
                  : preview.status === "CONSUMED"
                    ? "จ่ายออกแล้ว"
                    : preview.status}
              </p>
              <p className="mt-1 text-[17px] font-extrabold text-slate-900">
                {preview.productName}
              </p>
              <p className="text-[12px] font-semibold text-slate-600">
                {preview.labelCode} · {preview.productCode} · LOT{" "}
                {preview.lotNumber}
              </p>
              <p className="mt-1 text-[15px] font-black text-slate-900">
                {preview.quantity} {preview.unit}
              </p>
              {preview.sourceBranchName ? (
                <p className="text-[12px] text-slate-500">
                  จาก {preview.sourceBranchName}
                </p>
              ) : null}
            </div>

            {preview.status === "ACTIVE" ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                    รายละเอียดการจ่ายออก *
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="เช่น ส่งไปสาขา X / ใช้ในครัว"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-semibold focus:border-site-primary focus:outline-none focus:ring-2 focus:ring-site-primary/20"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmIssue()}
                  className="w-full rounded-2xl bg-amber-500 py-3.5 text-[15px] font-extrabold text-white shadow-sm disabled:opacity-60"
                >
                  {busy ? "กำลังบันทึก…" : "ยืนยันจ่ายออกรายการ"}
                </button>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      <StaffQrCameraScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanned}
        title="สแกน QR รายการ"
      />
    </>
  );
}

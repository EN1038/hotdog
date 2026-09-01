"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { isStockLabelQrPayload } from "@/lib/stock-label";

type LabelPreview = {
  id: string;
  labelCode: string;
  lotNumber: string;
  productName: string;
  productCode: string;
  brandName: string | null;
  sourceBranchName: string | null;
  quantity: number;
  unit: string;
  status: string;
  producedAt: string | null;
  expiresAt: string | null;
  documentNo: string | null;
  qrPayload: string;
};

type Props = {
  onBack: () => void;
};

export function StaffPackageOutPanel({ onBack }: Props) {
  const toast = useToast();
  const [scanValue, setScanValue] = useState("");
  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setLoading(true);
      try {
        const isQr = isStockLabelQrPayload(trimmed);
        const qs = isQr
          ? `qr=${encodeURIComponent(trimmed)}`
          : `code=${encodeURIComponent(trimmed)}`;
        const res = await fetch(`/api/staff/stock/package-out?${qs}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "ไม่พบป้าย",
          );
        }
        setPreview(body as LabelPreview);
      } catch (e) {
        setPreview(null);
        toast.error(
          "สแกนไม่สำเร็จ",
          e instanceof Error ? e.message : "ไม่พบป้ายแพ็ก",
        );
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    void lookup(scanValue);
  }

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
        "จ่ายแพ็กสำเร็จ",
        `${preview.productName} · ${preview.quantity} ${preview.unit}`,
      );
      setPreview(null);
      setScanValue("");
      setNote("");
      inputRef.current?.focus();
    } catch (e) {
      toast.error(
        "จ่ายออกไม่สำเร็จ",
        e instanceof Error ? e.message : "ลองใหม่",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"
        >
          ← กลับ
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900">จ่ายออกแพ็ก</h2>
          <p className="text-xs font-semibold text-slate-600">
            สแกนบาร์โค้ดหรือ QR บนป้ายแพ็ก
          </p>
        </div>
      </div>

      <form
        onSubmit={onScanSubmit}
        className="rounded-2xl bg-white p-4 shadow-sm"
      >
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-600">
            สแกนหรือพิมพ์รหัสป้าย
          </span>
          <input
            ref={inputRef}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            placeholder="สแกนบาร์โค้ด / QR"
            className="w-full rounded-xl border border-slate-200 px-3 py-3 font-mono text-[15px] font-bold"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !scanValue.trim()}
          className="mt-3 w-full rounded-xl bg-slate-900 py-3 text-[14px] font-extrabold text-white disabled:opacity-60"
        >
          {loading ? "กำลังค้นหา…" : "ค้นหาป้าย"}
        </button>
      </form>

      {loading ? <LoadingState label="กำลังค้นหาป้าย…" /> : null}

      {preview ? (
        <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <p className="text-[13px] font-bold text-site-primary">
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
              {preview.productCode} · LOT {preview.lotNumber}
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
                <span className="mb-1 block text-[12px] font-semibold text-slate-600">
                  รายละเอียดการจ่ายออก *
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="เช่น ส่งไปสาขา X / ใช้ในครัว"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-semibold"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmIssue()}
                className="w-full rounded-2xl bg-amber-500 py-3.5 text-[15px] font-extrabold text-white disabled:opacity-60"
              >
                {busy ? "กำลังบันทึก…" : "ยืนยันจ่ายออกแพ็ก"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

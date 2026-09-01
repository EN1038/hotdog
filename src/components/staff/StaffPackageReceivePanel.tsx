"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { StaffMenuScanField } from "@/components/staff/StaffMenuScanField";
import {
  fetchPackageLabelPreview,
  type StockLabelScanPreview,
} from "@/lib/stock-label-scan";

type Props = {
  onBack: () => void;
  onSuccess?: () => void;
  initialScan?: string;
};

export function StaffPackageReceivePanel({
  onBack,
  onSuccess,
  initialScan = "",
}: Props) {
  const toast = useToast();
  const [scanValue, setScanValue] = useState(initialScan);
  const [preview, setPreview] = useState<StockLabelScanPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialHandled = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setLoading(true);
      try {
        const body = await fetchPackageLabelPreview("package-receive", trimmed);
        setPreview(body);
      } catch (e) {
        setPreview(null);
        toast.error(
          "ค้นหาไม่สำเร็จ",
          e instanceof Error ? e.message : "ไม่พบป้ายแพ็ก",
        );
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!initialScan.trim() || initialHandled.current) return;
    initialHandled.current = true;
    void lookup(initialScan);
  }, [initialScan, lookup]);

  async function confirmReceive() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch("/api/staff/stock/package-receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelId: preview.id,
          labelCode: preview.labelCode,
          qrPayload: preview.qrPayload,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "รับเข้าไม่สำเร็จ",
        );
      }
      toast.success(
        "รับแพ็กสำเร็จ",
        `${preview.productName} · ${preview.quantity} ${preview.unit}`,
      );
      setPreview(null);
      setScanValue("");
      onSuccess?.();
      inputRef.current?.focus();
    } catch (e) {
      toast.error(
        "รับเข้าไม่สำเร็จ",
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
          <h2 className="text-lg font-extrabold text-slate-900">รับเข้าแพ็ก</h2>
          <p className="text-xs font-semibold text-slate-600">
            สแกนป้ายแพ็กที่ส่งมาจากคลัง/สาขาแพ็ก
          </p>
        </div>
      </div>

      <form
        className="rounded-2xl bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(scanValue);
        }}
      >
        <StaffMenuScanField
          label="รหัสป้าย / สแกน QR"
          value={scanValue}
          onChange={setScanValue}
          onSubmit={(next) => void lookup(next)}
          busy={loading}
          inputRef={inputRef}
          autoFocus={!initialScan.trim()}
          placeholder="กรอกรหัสป้าย หรือแตะไอคอนเพื่อสแกน QR"
          hint="รับแพ็กที่จ่ายออกจากคลังแล้ว — ไม่รับแพ็กที่ผลิตที่สาขานี้เอง"
          scannerTitle="สแกน QR บนป้ายแพ็ก"
        />
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
            <p className="text-[13px] font-bold text-emerald-700">พร้อมรับเข้า</p>
            <p className="mt-1 text-[17px] font-extrabold text-slate-900">
              {preview.productName}
            </p>
            <p className="text-[12px] font-semibold text-slate-600">
              {preview.labelCode} · {preview.productCode} · LOT {preview.lotNumber}
            </p>
            <p className="mt-1 text-[15px] font-black text-slate-900">
              {preview.quantity} {preview.unit}
            </p>
            <p className="text-[12px] text-slate-500">
              แพ็กจาก {preview.originBranchName}
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmReceive()}
            className="w-full rounded-2xl bg-emerald-600 py-3.5 text-[15px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? "กำลังบันทึก…" : "ยืนยันรับเข้าแพ็ก"}
          </button>
        </div>
      ) : null}
    </>
  );
}

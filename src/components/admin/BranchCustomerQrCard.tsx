"use client";

import { useEffect, useState } from "react";
import { btnOutline, btnPrimary } from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";

type BranchCustomerQrCardProps = {
  brandCode: string;
  branchCode: string;
};

/** ลิงก์ + QR สำหรับลูกค้าสแกนเข้าสาขาโดยตรง (หลัง login/guest → หน้าร้านสาขานั้น) */
export function BranchCustomerQrCard({
  brandCode,
  branchCode,
}: BranchCustomerQrCardProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const path = `/${brandCode}/${branchCode}`;
  const [absoluteUrl, setAbsoluteUrl] = useState(path);

  useEffect(() => {
    setAbsoluteUrl(`${window.location.origin}${path}`);
  }, [path]);

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=${encodeURIComponent(absoluteUrl)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      toast.success("คัดลอกลิงก์แล้ว");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ", "ลองเลือกข้อความแล้วคัดลอกเอง");
    }
  }

  async function downloadQr() {
    setDownloading(true);
    try {
      const res = await fetch(qrSrc);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `qr-${brandCode}-${branchCode}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("ดาวน์โหลด QR แล้ว");
    } catch {
      window.open(qrSrc, "_blank", "noopener,noreferrer");
      toast.error(
        "ดาวน์โหลดอัตโนมัติไม่สำเร็จ",
        "เปิดรูปแล้วให้บันทึกจากเบราว์เซอร์",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            QR / ลิงก์ลูกค้าเข้าสาขานี้
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            สแกนแล้วเข้าสู่ระบบหรือกดเข้าชมสาขา จะพาไปหน้าร้านสาขานี้เลย
            ไม่ผ่านหน้าเลือกสาขา — ลูกค้ากดกลับจากหน้าร้านจึงจะไปเลือกสาขาอื่น
          </p>
          <p className="mt-3 break-all font-mono text-xs text-slate-700">
            {absoluteUrl}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void copyLink()}
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
            <button
              type="button"
              className={btnOutline}
              disabled={downloading}
              onClick={() => void downloadQr()}
            >
              {downloading ? "กำลังดาวน์โหลด..." : "ดาวน์โหลด QR"}
            </button>
            <a
              href={absoluteUrl}
              target="_blank"
              rel="noreferrer"
              className={btnOutline}
            >
              เปิดทดสอบ
            </a>
          </div>
        </div>
        <div className="mx-auto shrink-0 rounded-xl border border-slate-100 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt={`QR เข้าสาขา ${branchCode}`}
            width={180}
            height={180}
            className="size-[180px]"
          />
        </div>
      </div>
    </div>
  );
}

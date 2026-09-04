"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { IconClose, IconLinkSuffix, IconQrCode, IconShare } from "@/components/icons";
import { appAbsoluteUrl } from "@/lib/app-url";
import { copyTextToClipboard, sharePublicLink } from "@/lib/share-media";

type StaffBranchShopShareSheetProps = {
  branchId: string;
  branchName?: string | null;
  brandCode?: string | null;
  branchCode?: string | null;
  onClose: () => void;
};

/** Bottom sheet: QR + copy + share for this branch's customer shop. */
export function StaffBranchShopShareSheet({
  branchId,
  branchName,
  brandCode,
  branchCode,
  onClose,
}: StaffBranchShopShareSheetProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const path =
    brandCode && branchCode
      ? `/${brandCode}/${branchCode}`
      : `/order/store/${branchId}`;
  const configuredUrl = useMemo(() => appAbsoluteUrl(path), [path]);
  const [absoluteUrl, setAbsoluteUrl] = useState(configuredUrl);

  useEffect(() => {
    setAbsoluteUrl(appAbsoluteUrl(path));
  }, [path]);

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=12&data=${encodeURIComponent(absoluteUrl)}`;
  const title = branchName?.trim() || "หน้าร้านสาขา";

  async function copyLink() {
    const ok = await copyTextToClipboard(absoluteUrl);
    if (ok) {
      setCopied(true);
      toast.success("คัดลอกลิงก์แล้ว");
      window.setTimeout(() => setCopied(false), 2000);
      return;
    }
    toast.error("คัดลอกไม่สำเร็จ", "ลองเลือกข้อความแล้วคัดลอกเอง");
  }

  async function shareLink() {
    setSharing(true);
    try {
      const result = await sharePublicLink({
        url: absoluteUrl,
        title,
        text: `สั่งอาหารจาก ${title}`,
      });
      if (result.ok && result.mode === "share") {
        toast.success("แชร์แล้ว");
      } else if (result.ok && result.mode === "copy") {
        setCopied(true);
        toast.success("คัดลอกลิงก์แล้ว", "เครื่องนี้ไม่รองรับแชร์โดยตรง");
        window.setTimeout(() => setCopied(false), 2000);
      } else if (result.error !== "cancelled") {
        toast.error("แชร์ไม่สำเร็จ", "ลองคัดลอกลิงก์แทน");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-shop-share-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <p
              id="staff-shop-share-title"
              className="text-lg font-extrabold text-slate-900"
            >
              ลิงก์หน้าร้านลูกค้า
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-500">
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
          >
            <IconClose size={20} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <p className="text-[13px] leading-relaxed text-slate-500">
            ให้ลูกค้าสแกน QR หรือส่งลิงก์นี้เพื่อเข้าหน้าร้านสาขานี้โดยตรง
          </p>
        </div>

        <div className="flex justify-center px-5 pb-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={`QR หน้าร้าน ${title}`}
              width={200}
              height={200}
              className="size-[200px]"
            />
          </div>
        </div>

        <p className="break-all px-5 pb-4 text-center font-mono text-[12px] leading-relaxed text-slate-600">
          {absoluteUrl}
        </p>

        <div className="space-y-2 px-5 pb-6">
          <button
            type="button"
            onClick={() => void shareLink()}
            disabled={sharing}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-site-primary px-4 text-[15px] font-extrabold text-white disabled:opacity-60"
          >
            <IconShare size={18} />
            {sharing ? "กำลังแชร์…" : "แชร์ลิงก์"}
          </button>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-[15px] font-bold text-slate-800"
          >
            <IconLinkSuffix size={18} />
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </button>
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-700"
          >
            <IconQrCode size={18} />
            เปิดหน้าร้าน
          </a>
        </div>
      </div>
    </div>
  );
}

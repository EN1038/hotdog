"use client";

import { useEffect, useState } from "react";
import { IconClose } from "@/components/icons";
import { IconLine } from "@/components/owner/owner-register-ui";
import { useToast } from "@/components/admin/Toast";
import { formatThaiPhone } from "@/lib/constants";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

type AccountInfo = {
  username: string;
  phone: string | null;
};

type OwnerAccountModalProps = {
  brandId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[12px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-all text-[16px] font-extrabold text-slate-900">
        {value}
      </p>
    </div>
  );
}

export function OwnerAccountModal({
  open,
  onClose,
}: OwnerAccountModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<AccountInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/owner/account");
        if (!res.ok) {
          if (!cancelled) {
            toast.error("โหลดไม่สำเร็จ", "ลองใหม่อีกครั้ง");
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setInfo({
          username: data.username ?? "",
          phone: data.phone ?? null,
        });
      } catch {
        if (!cancelled) {
          toast.error("โหลดไม่สำเร็จ", "เชื่อมต่อไม่ได้");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable enough
  }, [open]);

  if (!open) return null;

  const phoneLabel = info?.phone
    ? formatThaiPhone(info.phone)
    : "ยังไม่มีเบอร์";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-account-modal-title"
        className="relative z-10 flex max-h-[min(92dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:mx-4 sm:rounded-[1.75rem]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p
            id="owner-account-modal-title"
            className="text-[17px] font-extrabold text-slate-900"
          >
            บัญชีเจ้าของ
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
            aria-label="ปิด"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading || !info ? (
            <p className="py-10 text-center text-sm text-slate-500">
              กำลังโหลด…
            </p>
          ) : (
            <div className="space-y-3 pb-2">
              <InfoRow
                label="ชื่อเข้าสู่ระบบ"
                value={info.username || "ยังไม่มีบัญชี"}
              />
              <InfoRow label="เบอร์โทร" value={phoneLabel} />

              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-slate-800">
                  เปลี่ยนรหัสผ่าน
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  ต้องแจ้งแอดมิน SkillSale ให้ช่วยตั้งรหัสใหม่เท่านั้น
                </p>
                <a
                  href={PLATFORM_LINE_ADD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 text-[14px] font-extrabold text-white active:brightness-95"
                >
                  <IconLine className="h-5 w-5 shrink-0" />
                  ติดต่อแอดมิน
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-2xl bg-slate-900 text-[15px] font-bold text-white active:bg-slate-800"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

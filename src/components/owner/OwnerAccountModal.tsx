"use client";

import { useEffect, useState } from "react";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { PhoneInput } from "@/components/PhoneInput";
import { IconClose } from "@/components/icons";
import { IconLine } from "@/components/owner/owner-register-ui";
import { useToast } from "@/components/admin/Toast";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

type AccountForm = {
  username: string;
  phone: string;
};

type OwnerAccountModalProps = {
  brandId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function OwnerAccountModal({
  open,
  onClose,
  onSaved,
}: OwnerAccountModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccountForm | null>(null);

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
        setForm({
          username: data.username ?? "",
          phone: data.phone ?? "",
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

  function patch(partial: Partial<AccountForm>) {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  async function save() {
    if (!form) return;
    const username = form.username.trim();
    if (username.length < 3) {
      toast.error("บันทึกไม่สำเร็จ", "กรุณาใส่ชื่อเข้าสู่ระบบ");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/owner/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          phone: form.phone.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      setForm({
        username: json.username ?? username,
        phone: json.phone ?? "",
      });
      toast.success("บันทึกแล้ว");
      onSaved?.();
      onClose();
    } catch {
      toast.error("บันทึกไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

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
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:mx-4 sm:rounded-[1.75rem]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p
              id="owner-account-modal-title"
              className="text-[17px] font-extrabold text-slate-900"
            >
              บัญชีเจ้าของ
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              แก้ชื่อเข้าสู่ระบบและเบอร์โทร
            </p>
          </div>
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
          {loading || !form ? (
            <p className="py-10 text-center text-sm text-slate-500">
              กำลังโหลด…
            </p>
          ) : (
            <div className="space-y-4 pb-2">
              <div>
                <label className={adminLabelClass}>ชื่อเข้าสู่ระบบ</label>
                <input
                  className={adminInputClass}
                  value={form.username}
                  onChange={(e) => patch({ username: e.target.value })}
                  autoComplete="username"
                  placeholder="ชื่อที่ใช้ล็อกอิน"
                />
              </div>

              <div>
                <label className={adminLabelClass}>เบอร์โทร</label>
                <PhoneInput
                  value={form.phone}
                  onChange={(digits) => patch({ phone: digits })}
                  className={adminInputClass}
                  placeholder="เช่น 0812345678"
                />
              </div>

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
            disabled={saving || loading || !form}
            onClick={() => void save()}
            className="min-h-12 w-full rounded-2xl bg-site-primary text-[15px] font-bold text-white active:bg-site-primary-active disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

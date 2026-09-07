"use client";

import { useEffect, useState } from "react";
import { ImageField } from "@/components/admin/ImageField";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { BrandColorPicker } from "@/components/BrandColorPicker";
import { PhoneInput } from "@/components/PhoneInput";
import { IconClose, IconStore } from "@/components/icons";
import { useToast } from "@/components/admin/Toast";
import { DEFAULT_BRAND_COLOR, normalizePrimaryColor } from "@/lib/color";
import { markOwnerBrandSetupDismissed } from "@/lib/owner-brand-setup";

type BrandForm = {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  color: string;
};

type OwnerBrandProfileSetupModalProps = {
  brandId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** onboarding = first-run; settings = full edit from ตั้งค่า */
  mode?: "onboarding" | "settings";
};

export function OwnerBrandProfileSetupModal({
  brandId,
  open,
  onClose,
  onSaved,
  mode = "onboarding",
}: OwnerBrandProfileSetupModalProps) {
  const toast = useToast();
  const isSettings = mode === "settings";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BrandForm | null>(null);

  useEffect(() => {
    if (!open || !brandId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/brands/${brandId}`);
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
          id: data.id,
          code: data.code ?? "",
          name: data.name ?? "",
          nameTh: data.nameTh ?? null,
          contactPhone: data.contactPhone ?? null,
          logoUrl: data.logoUrl ?? null,
          coverImageUrl: data.coverImageUrl ?? null,
          color: normalizePrimaryColor(
            data.color ?? DEFAULT_BRAND_COLOR,
            DEFAULT_BRAND_COLOR,
          ),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable enough; avoid refetch loops
  }, [open, brandId]);

  function dismiss() {
    if (!isSettings) {
      markOwnerBrandSetupDismissed(brandId);
    }
    onClose();
  }

  function patch(partial: Partial<BrandForm>) {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  async function save() {
    if (!form) return;
    const name = form.name.trim();
    if (isSettings && !name) {
      toast.error("บันทึกไม่สำเร็จ", "กรุณาใส่ชื่อร้าน");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        logoUrl: form.logoUrl,
        coverImageUrl: form.coverImageUrl,
        color: form.color,
      };
      if (isSettings) {
        body.name = name;
        body.contactPhone = form.contactPhone?.trim() || null;
      }
      const res = await fetch(`/api/admin/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      document.documentElement.style.setProperty("--site-primary", form.color);
      window.dispatchEvent(new Event("brand-profile-updated"));
      toast.success("บันทึกแล้ว");
      if (!isSettings) {
        markOwnerBrandSetupDismissed(brandId);
      }
      onSaved?.();
      onClose();
    } catch {
      toast.error("บันทึกไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const accent = form?.color || DEFAULT_BRAND_COLOR;
  const shopName =
    form?.name?.trim() || form?.nameTh?.trim() || "ร้านของคุณ";
  const coverUrl = form?.coverImageUrl?.trim() || "";
  const logoUrl = form?.logoUrl?.trim() || "";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-black/45"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-brand-setup-title"
        className="relative z-10 flex max-h-[min(92dvh,44rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:mx-4 sm:rounded-[1.75rem]"
      >
        <div
          className="relative shrink-0 overflow-hidden text-white"
          style={{ backgroundColor: accent }}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center opacity-40"
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />

          <div className="relative z-10 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="mb-3 flex items-start justify-between gap-2">
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                {isSettings ? "โปรไฟล์ร้าน" : "ตัวอย่างหน้าจอ"}
              </span>
              <button
                type="button"
                onClick={dismiss}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm active:bg-white/30"
                aria-label="ปิด"
              >
                <IconClose size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/25 ring-2 ring-white/50 shadow-md">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <IconStore size={22} className="text-white/90" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  id="owner-brand-setup-title"
                  className="truncate text-[18px] font-black leading-tight text-white drop-shadow-sm"
                >
                  {shopName}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-white/85">
                  ลูกค้า พนักงาน และหลังบ้าน จะเห็นสไตล์ร้านแบบนี้
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span
                className="inline-flex min-h-[2.25rem] flex-1 items-center justify-center rounded-xl text-[13px] font-bold text-white shadow-sm"
                style={{ backgroundColor: "rgba(255,255,255,0.22)" }}
              >
                ตัวอย่างปุ่มสีร้าน
              </span>
              <span
                className="inline-flex min-h-[2.25rem] items-center justify-center rounded-xl bg-white px-3 text-[13px] font-bold shadow-sm"
                style={{ color: accent }}
              >
                ตัวอย่าง
              </span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading || !form ? (
            <p className="py-10 text-center text-sm text-slate-500">
              กำลังโหลด…
            </p>
          ) : (
            <div className="space-y-5 pb-2">
              {isSettings ? (
                <section>
                  <p className="text-sm font-semibold text-slate-900">
                    ข้อมูลร้าน
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ชื่อและเบอร์ที่ลูกค้าติดต่อร้านได้
                  </p>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className={adminLabelClass}>ชื่อร้าน</label>
                      <input
                        className={adminInputClass}
                        value={form.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        placeholder="ชื่อร้าน"
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>เบอร์โทรร้าน</label>
                      <PhoneInput
                        value={form.contactPhone ?? ""}
                        onChange={(digits) =>
                          patch({ contactPhone: digits || null })
                        }
                        className={adminInputClass}
                        placeholder="เช่น 081-234-5678"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        ใช้เมื่อลูกค้าต้องการติดต่อร้าน
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className={isSettings ? "border-t border-slate-100 pt-5" : undefined}>
                <p className="text-sm font-semibold text-slate-900">ธีมร้าน</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  สีปุ่มและหัวร้านที่ลูกค้ากับพนักงานเห็นด้วย
                </p>
                <div className="mt-3">
                  <BrandColorPicker
                    value={accent}
                    onChange={(next) => patch({ color: next })}
                    showHint={false}
                    compact
                  />
                </div>
              </section>

              <section className="border-t border-slate-100 pt-5">
                <p className="text-sm font-semibold text-slate-900">รูปร้าน</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  เลือกรูปจากมือถือได้ ยังไม่ใส่ก็ได้
                </p>

                <div className="mt-3 space-y-3 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-sm">
                  <div>
                    <div className="border-b border-slate-100 bg-slate-50/80 px-3 pt-3">
                      <ImageField
                        label="รูปปก"
                        value={form.coverImageUrl ?? ""}
                        onChange={(url) =>
                          patch({ coverImageUrl: url || null })
                        }
                        shopCode={form.code}
                        folder="Brand"
                        aspectClassName="aspect-[2/1]"
                        cropAspect={3 / 2}
                        cropTitle="จัดขนาดรูปปก"
                        objectFit="cover"
                        hint="รูปใหญ่ด้านบนที่ลูกค้าเห็นตอนเปิดหน้าร้าน"
                        showUrlOption={false}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="bg-slate-50/80 px-3 pb-3 pt-3">
                      <ImageField
                        label="โลโก้ร้าน"
                        value={form.logoUrl ?? ""}
                        onChange={(url) => patch({ logoUrl: url || null })}
                        shopCode={form.code}
                        folder="Brand"
                        aspectClassName="aspect-[2/1]"
                        cropAspect={1}
                        cropTitle="จัดขนาดโลโก้"
                        objectFit="contain"
                        hint="รูปเล็กประจำร้าน เช่น โลโก้หรือป้ายร้าน"
                        showUrlOption={false}
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={dismiss}
            aria-label={isSettings ? "ปิด" : undefined}
            className="flex min-h-[3rem] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-[15px] font-bold text-slate-700 active:bg-slate-50"
          >
            {isSettings ? <IconClose size={18} /> : "ไว้ทีหลัง"}
          </button>
          <button
            type="button"
            disabled={saving || loading || !form}
            onClick={() => void save()}
            className="min-h-[3rem] flex-[1.35] rounded-2xl px-3 text-[15px] font-bold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: accent }}
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

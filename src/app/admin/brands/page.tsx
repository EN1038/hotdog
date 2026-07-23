"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { ImageField } from "@/components/admin/ImageField";
import { PhoneInput } from "@/components/PhoneInput";
import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
} from "@/lib/color";
import { getBrandProfileGaps } from "@/lib/brand-profile";
import {
  BRAND_COVER_IMAGE_SIZE_HINT,
  BRAND_LOGO_SIZE_HINT,
} from "@/lib/image-guides";

type Brand = {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  nameEn: string | null;
  siteTitle: string | null;
  siteDescription: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  contactPhone: string | null;
  color: string;
  queueTicketCopies?: number;
  _count: { branches: number; members: number };
};

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="color"
        value={value || DEFAULT_BRAND_COLOR}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
        aria-label="เลือกสีแบรนด์"
      />
      <input
        className={`${adminInputClass} max-w-[7.5rem] font-mono text-xs`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#dc2626"
      />
      <div className="flex flex-wrap gap-1.5">
        {BRAND_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            title={preset}
            onClick={() => onChange(preset)}
            className={`h-6 w-6 rounded-full border-2 ${
              value.toLowerCase() === preset
                ? "border-slate-900"
                : "border-transparent ring-1 ring-slate-200"
            }`}
            style={{ backgroundColor: preset }}
          />
        ))}
      </div>
    </div>
  );
}

export default function BrandsPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const isPlatformAdmin = Boolean(session?.isPlatformAdmin);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;

    if (session?.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }

    fetch("/api/admin/brands").then(async (res) => {
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.ok) setBrands(await res.json());
      setLoading(false);
    });
  }, [loaded, session, router]);

  async function saveBrand(brand: Brand) {
    setSavingId(brand.id);
    try {
      const res = await fetch(`/api/admin/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: brand.code,
          name: brand.name,
          nameTh: brand.nameTh,
          nameEn: brand.nameEn,
          siteTitle: brand.siteTitle,
          siteDescription: brand.siteDescription,
          logoUrl: brand.logoUrl,
          coverImageUrl: brand.coverImageUrl,
          contactPhone: brand.contactPhone,
          color: brand.color,
          queueTicketCopies: brand.queueTicketCopies ?? 1,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("บันทึกแบรนด์แล้ว");
      // แจ้ง sidebar ให้รีเฟรช badge
      window.dispatchEvent(new Event("brand-profile-updated"));
    } finally {
      setSavingId(null);
    }
  }

  function patchBrand(id: string, patch: Partial<Brand>) {
    setBrands((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  if (!loaded || isPlatformAdmin || loading) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <AdminPageHeader
        title="โปรไฟล์แบรนด์"
        description="แก้ชื่อ โลโก้ รูปปก สี และข้อมูลที่แสดงบนหน้าร้านของคุณ"
      />

      <div className="space-y-5">
        {brands.map((brand) => {
          const accent = brand.color || DEFAULT_BRAND_COLOR;
          const draftGaps = getBrandProfileGaps(brand);
          const jump = (id: string) => {
            document
              .getElementById(id)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          };
          return (
            <section
              key={brand.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"
                style={{
                  background: `linear-gradient(90deg, ${accent}14, transparent 55%)`,
                }}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                    <h3 className="truncate text-base font-semibold text-slate-900">
                      {brand.name}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                      /{brand.code}
                    </span>
                    {draftGaps.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        ยังไม่ครบ {draftGaps.length}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    สาขา {brand._count.branches} แห่ง · ผู้ดูแล{" "}
                    {brand._count.members} คน
                  </p>
                </div>
                <Link
                  href={`/${brand.code}`}
                  target="_blank"
                  className={btnOutline}
                >
                  เปิดหน้าร้าน
                </Link>
              </div>

              <div className="space-y-6 p-5">
                {draftGaps.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">
                      โปรไฟล์ยังไม่ครบ ({draftGaps.length})
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      กรอกแล้วกดบันทึก — badge เมนูด้านข้างจะหายหลังบันทึกสำเร็จ
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-amber-900">
                      {draftGaps.includes("โลโก้") && (
                        <li>
                          <button
                            type="button"
                            onClick={() => jump(`brand-logo-${brand.id}`)}
                            className="font-medium underline underline-offset-2"
                          >
                            โลโก้
                          </button>
                        </li>
                      )}
                      {draftGaps.includes("รูปปกแบรนด์") && (
                        <li>
                          <button
                            type="button"
                            onClick={() => jump(`brand-cover-${brand.id}`)}
                            className="font-medium underline underline-offset-2"
                          >
                            รูปปก
                          </button>
                        </li>
                      )}
                      {draftGaps.includes("เบอร์ติดต่อ") && (
                        <li>
                          <button
                            type="button"
                            onClick={() => jump(`brand-phone-${brand.id}`)}
                            className="font-medium underline underline-offset-2"
                          >
                            เบอร์ติดต่อ
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* 1. Visuals */}
                <div>
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">
                      ภาพแบรนด์
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      โลโก้ใช้ในหน้าร้าน · รูปปกเป็นหัวภาพเมื่อเข้าจากลิงก์แบรนด์
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,16rem)]">
                    <div id={`brand-logo-${brand.id}`}>
                      <div
                        className={
                          !brand.logoUrl?.trim()
                            ? "rounded-xl ring-1 ring-amber-200"
                            : undefined
                        }
                      >
                        <ImageField
                          label={
                            !brand.logoUrl?.trim()
                              ? "โลโก้ · ยังไม่มี"
                              : "โลโก้"
                          }
                          value={brand.logoUrl ?? ""}
                          onChange={(url) =>
                            patchBrand(brand.id, { logoUrl: url || null })
                          }
                          shopCode={brand.code}
                          folder="Brand"
                          aspectClassName="aspect-square"
                          size="compact"
                          hint={BRAND_LOGO_SIZE_HINT}
                        />
                      </div>
                    </div>
                    <div id={`brand-cover-${brand.id}`}>
                      <div
                        className={
                          !brand.coverImageUrl?.trim()
                            ? "rounded-xl ring-1 ring-amber-200"
                            : undefined
                        }
                      >
                        <ImageField
                          label={
                            !brand.coverImageUrl?.trim()
                              ? "รูปปก · ยังไม่มี"
                              : "รูปปก"
                          }
                          value={brand.coverImageUrl ?? ""}
                          onChange={(url) =>
                            patchBrand(brand.id, {
                              coverImageUrl: url || null,
                            })
                          }
                          shopCode={brand.code}
                          folder="Brand"
                          aspectClassName="aspect-[3/2]"
                          size="compact"
                          hint={BRAND_COVER_IMAGE_SIZE_HINT}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Identity */}
                <div className="border-t border-slate-100 pt-6">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">
                      ข้อมูลแบรนด์
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      ชื่อและสีที่ใช้แสดงให้ลูกค้า
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={adminLabelClass}>ชื่อ (หลัก)</label>
                      <input
                        className={adminInputClass}
                        value={brand.name}
                        onChange={(e) =>
                          patchBrand(brand.id, { name: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>ชื่อภาษาไทย</label>
                      <input
                        className={adminInputClass}
                        value={brand.nameTh ?? ""}
                        onChange={(e) =>
                          patchBrand(brand.id, {
                            nameTh: e.target.value || null,
                          })
                        }
                        placeholder="ว่าง = ใช้ชื่อหลัก"
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>ชื่อภาษาอังกฤษ</label>
                      <input
                        className={adminInputClass}
                        value={brand.nameEn ?? ""}
                        onChange={(e) =>
                          patchBrand(brand.id, {
                            nameEn: e.target.value || null,
                          })
                        }
                        placeholder="ว่าง = ใช้ชื่อหลัก"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={adminLabelClass}>สีแบรนด์</label>
                      <ColorPicker
                        value={accent}
                        onChange={(next) =>
                          patchBrand(brand.id, { color: next })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2" id={`brand-phone-${brand.id}`}>
                      <label className={adminLabelClass}>
                        เบอร์ติดต่อแบรนด์
                        {!brand.contactPhone?.trim() && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            ยังไม่มี
                          </span>
                        )}
                      </label>
                      <PhoneInput
                        value={brand.contactPhone ?? ""}
                        onChange={(digits) =>
                          patchBrand(brand.id, {
                            contactPhone: digits || null,
                          })
                        }
                        className={`${adminInputClass}${
                          !brand.contactPhone?.trim()
                            ? " border-amber-300 ring-1 ring-amber-200"
                            : ""
                        }`}
                        placeholder="เช่น 081-234-5678"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        ใช้เมื่อลูกค้ากด “แจ้งให้เราทราบ” ในหน้ารายการสาขา
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={adminLabelClass}>
                        จำนวนบัตรคิวที่พิมพ์
                      </label>
                      <select
                        className={adminInputClass}
                        value={brand.queueTicketCopies ?? 1}
                        onChange={(e) =>
                          patchBrand(brand.id, {
                            queueTicketCopies: Number(e.target.value),
                          })
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} ใบ
                            {n === 1
                              ? " (ใบเดียว)"
                              : n === 2
                                ? " (ร้าน + ลูกค้า)"
                                : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        ใช้กับแอป SkillSale Print — 1 = ใบเดียว · 2 =
                        ใบร้าน (ติดตะกร้า) + ใบลูกค้า · มากกว่า 2 =
                        สำเนาเพิ่ม
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Storefront */}
                <div className="border-t border-slate-100 pt-6">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-slate-900">
                      ลิงก์หน้าร้าน
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      รหัส URL และข้อความบนแท็บเบราว์เซอร์
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={adminLabelClass}>รหัส (URL)</label>
                      <input
                        className={`${adminInputClass} font-mono text-sm`}
                        value={brand.code}
                        onChange={(e) =>
                          patchBrand(brand.id, { code: e.target.value })
                        }
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        ลูกค้าเข้าที่{" "}
                        <Link
                          href={`/${brand.code}`}
                          className="font-medium text-site-primary hover:underline"
                          target="_blank"
                        >
                          /{brand.code}
                        </Link>
                      </p>
                    </div>
                    <div>
                      <label className={adminLabelClass}>
                        ชื่อแท็บเบราว์เซอร์
                      </label>
                      <input
                        className={adminInputClass}
                        value={brand.siteTitle ?? ""}
                        onChange={(e) =>
                          patchBrand(brand.id, {
                            siteTitle: e.target.value || null,
                          })
                        }
                        placeholder={`${brand.name} - สั่งอาหารออนไลน์`}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={adminLabelClass}>คำอธิบายหน้าร้าน</label>
                      <textarea
                        className={`${adminInputClass} min-h-[72px]`}
                        rows={2}
                        value={brand.siteDescription ?? ""}
                        onChange={(e) =>
                          patchBrand(brand.id, {
                            siteDescription: e.target.value || null,
                          })
                        }
                        placeholder="ข้อความสั้นๆ แนะนำร้านให้ลูกค้า"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => void saveBrand(brand)}
                    disabled={savingId === brand.id}
                    className={`${btnPrimary} min-w-[10rem] disabled:opacity-60`}
                  >
                    {savingId === brand.id
                      ? "กำลังบันทึก..."
                      : "บันทึกโปรไฟล์"}
                  </button>
                </div>
              </div>
            </section>
          );
        })}

        {brands.length === 0 && (
          <AdminEmptyState
            title="ยังไม่มีแบรนด์ที่คุณดูแล"
            description="ติดต่อผู้ดูแลแพลตฟอร์มเพื่อขอสิทธิ์"
          />
        )}
      </div>
    </div>
  );
}

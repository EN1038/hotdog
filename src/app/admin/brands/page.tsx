"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  adminInputClass,
  adminLabelClass,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
} from "@/lib/color";

type Brand = {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  nameEn: string | null;
  siteTitle: string | null;
  siteDescription: string | null;
  logoUrl: string | null;
  color: string;
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
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={value || DEFAULT_BRAND_COLOR}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
          aria-label="เลือกสีแบรนด์"
        />
        <input
          className={`${adminInputClass} max-w-[8rem] font-mono text-xs`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#dc2626"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BRAND_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            title={preset}
            onClick={() => onChange(preset)}
            className={`h-6 w-6 rounded-full border-2 ${
              value.toLowerCase() === preset
                ? "border-slate-900"
                : "border-transparent"
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
        color: brand.color,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("บันทึกแบรนด์แล้ว");
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
        description="แก้ชื่อ โลโก้ สี และข้อมูลที่แสดงบนหน้าร้านของคุณ"
      />

      <div className="space-y-4">
        {brands.map((brand) => (
          <div
            key={brand.id}
            className={`${adminCardClass} border-l-4`}
            style={{
              borderLeftColor: brand.color || DEFAULT_BRAND_COLOR,
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={adminLabelClass}>รหัส (URL)</label>
                <input
                  className={adminInputClass}
                  value={brand.code}
                  onChange={(e) =>
                    patchBrand(brand.id, { code: e.target.value })
                  }
                />
              </div>
              <div>
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
                />
              </div>
              <div>
                <label className={adminLabelClass}>ชื่อแท็บเบราว์เซอร์</label>
                <input
                  className={adminInputClass}
                  value={brand.siteTitle ?? ""}
                  onChange={(e) =>
                    patchBrand(brand.id, {
                      siteTitle: e.target.value || null,
                    })
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>คำอธิบายหน้าร้าน</label>
                <textarea
                  className={adminInputClass}
                  rows={2}
                  value={brand.siteDescription ?? ""}
                  onChange={(e) =>
                    patchBrand(brand.id, {
                      siteDescription: e.target.value || null,
                    })
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>โลโก้ URL</label>
                <input
                  className={adminInputClass}
                  value={brand.logoUrl ?? ""}
                  onChange={(e) =>
                    patchBrand(brand.id, {
                      logoUrl: e.target.value || null,
                    })
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>สีแบรนด์</label>
                <ColorPicker
                  value={brand.color || DEFAULT_BRAND_COLOR}
                  onChange={(next) => patchBrand(brand.id, { color: next })}
                />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  onClick={() => saveBrand(brand)}
                  className={`w-full ${btnPrimary}`}
                >
                  บันทึกโปรไฟล์แบรนด์
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              สาขา {brand._count.branches} แห่ง ·{" "}
              <Link
                href={`/${brand.code}`}
                className="font-medium text-red-600 hover:underline"
                target="_blank"
              >
                /{brand.code}
              </Link>
            </p>
          </div>
        ))}

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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
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
  logoUrl: string | null;
  color: string;
  _count: { branches: number };
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
          className="h-10 w-12 cursor-pointer rounded border border-gray-300 bg-white p-1"
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
                ? "border-gray-900"
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
  const toast = useToast();
  const { confirm } = useConfirm();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);

  async function load() {
    const res = await fetch("/api/admin/brands");
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) setBrands(await res.json());
  }

  useEffect(() => {
    load();
  }, [router]);

  async function createBrand(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.trim().toLowerCase(),
        name: name.trim(),
        nameTh: nameTh.trim() || null,
        nameEn: nameEn.trim() || null,
        logoUrl: logoUrl.trim() || null,
        color,
      }),
    });
    setCode("");
    setName("");
    setNameTh("");
    setNameEn("");
    setLogoUrl("");
    setColor(DEFAULT_BRAND_COLOR);
    load();
  }

  async function saveBrand(brand: Brand) {
    await fetch(`/api/admin/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: brand.code,
        name: brand.name,
        nameTh: brand.nameTh,
        nameEn: brand.nameEn,
        logoUrl: brand.logoUrl,
        color: brand.color,
      }),
    });
    toast.success("บันทึกแบรนด์แล้ว");
    load();
  }

  async function deleteBrand(id: string) {
    const ok = await confirm({
      title: "ลบแบรนด์?",
      message: "ลบแบรนด์นี้ออกจากระบบ — สาขาที่ผูกอยู่อาจได้รับผลกระทบ",
      confirmLabel: "ลบแบรนด์",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบไม่สำเร็จ", data.error ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบแบรนด์แล้ว");
    load();
  }

  function patchBrand(id: string, patch: Partial<Brand>) {
    setBrands((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">จัดการแบรนด์</h2>
      <p className="mt-1 text-sm text-gray-500">
        ชื่อแบรนด์รองรับสองภาษา — ถ้าไม่กรอกไทย/อังกฤษ ระบบใช้ชื่อหลักแทน
      </p>

      <form
        onSubmit={createBrand}
        className="mt-6 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div>
          <label className={adminLabelClass}>รหัสแบรนด์</label>
          <input
            className={adminInputClass}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="malawaiwai"
            required
          />
        </div>
        <div>
          <label className={adminLabelClass}>ชื่อแบรนด์ (หลัก)</label>
          <input
            className={adminInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={adminLabelClass}>ชื่อภาษาไทย</label>
          <input
            className={adminInputClass}
            value={nameTh}
            onChange={(e) => setNameTh(e.target.value)}
            placeholder="ว่าง = ใช้ชื่อหลัก"
          />
        </div>
        <div>
          <label className={adminLabelClass}>ชื่อภาษาอังกฤษ</label>
          <input
            className={adminInputClass}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="ว่าง = ใช้ชื่อหลัก"
          />
        </div>
        <div>
          <label className={adminLabelClass}>URL โลโก้</label>
          <input
            className={adminInputClass}
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className={adminLabelClass}>สีแบรนด์</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <button type="submit" className={`w-full ${btnPrimary}`}>
            เพิ่มแบรนด์
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {brands.map((brand) => (
          <div
            key={brand.id}
            className="rounded-xl border bg-white p-4"
            style={{
              borderColor: brand.color || DEFAULT_BRAND_COLOR,
              boxShadow: `inset 4px 0 0 ${brand.color || DEFAULT_BRAND_COLOR}`,
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={adminLabelClass}>รหัส</label>
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
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  onClick={() => saveBrand(brand)}
                  className="flex-1 cursor-pointer rounded-lg border border-red-400 bg-white py-2 text-sm font-medium text-red-600 transition hover:border-red-500 hover:bg-red-50 hover:text-red-700 active:bg-red-100"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => deleteBrand(brand.id)}
                  className={btnOutline}
                >
                  ลบ
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              สาขา {brand._count.branches} แห่ง • ลิงก์ตัวอย่าง{" "}
              <Link
                href={`/${brand.code}`}
                className="text-red-600 hover:underline"
                target="_blank"
              >
                /{brand.code}
              </Link>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

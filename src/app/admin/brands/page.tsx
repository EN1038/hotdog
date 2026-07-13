"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";

type Brand = {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  _count: { branches: number };
};

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

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
        logoUrl: logoUrl.trim() || null,
      }),
    });
    setCode("");
    setName("");
    setLogoUrl("");
    load();
  }

  async function saveBrand(brand: Brand) {
    await fetch(`/api/admin/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: brand.code,
        name: brand.name,
        logoUrl: brand.logoUrl,
      }),
    });
    load();
  }

  async function deleteBrand(id: string) {
    if (!window.confirm("ลบแบรนด์นี้?")) return;
    const res = await fetch(`/api/admin/brands/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "ลบไม่สำเร็จ");
      return;
    }
    load();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">จัดการแบรนด์</h2>
      <p className="mt-1 text-sm text-gray-500">
        แบรนด์ใช้สำหรับ URL เช่น /malawaiwai/klong6 และแสดงโลโก้ในแอปลูกค้า
      </p>

      <form
        onSubmit={createBrand}
        className="mt-6 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4"
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
          <label className={adminLabelClass}>ชื่อแบรนด์</label>
          <input
            className={adminInputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
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
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white"
          >
            เพิ่มแบรนด์
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {brands.map((brand) => (
          <div
            key={brand.id}
            className="rounded-xl border bg-white p-4"
          >
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className={adminLabelClass}>รหัส</label>
                <input
                  className={adminInputClass}
                  value={brand.code}
                  onChange={(e) =>
                    setBrands((prev) =>
                      prev.map((b) =>
                        b.id === brand.id ? { ...b, code: e.target.value } : b,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>ชื่อ</label>
                <input
                  className={adminInputClass}
                  value={brand.name}
                  onChange={(e) =>
                    setBrands((prev) =>
                      prev.map((b) =>
                        b.id === brand.id ? { ...b, name: e.target.value } : b,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>โลโก้ URL</label>
                <input
                  className={adminInputClass}
                  value={brand.logoUrl ?? ""}
                  onChange={(e) =>
                    setBrands((prev) =>
                      prev.map((b) =>
                        b.id === brand.id
                          ? { ...b, logoUrl: e.target.value || null }
                          : b,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => saveBrand(brand)}
                  className="flex-1 rounded-lg border border-red-500 py-2 text-sm font-medium text-red-600"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => deleteBrand(brand.id)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
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

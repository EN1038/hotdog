"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";

type Brand = { id: string; name: string; code: string };

type Branch = {
  id: string;
  name: string;
  code: string | null;
  brand: Brand | null;
  _count: {
    staff: number;
    menuItems: number;
    deliveryLocations: number;
    orders: number;
  };
};

export default function AdminDashboard() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/branches"),
      fetch("/api/admin/brands"),
    ]).then(async ([branchRes, brandRes]) => {
      if (branchRes.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (branchRes.ok) setBranches(await branchRes.json());
      if (brandRes.ok) setBrands(await brandRes.json());
      setLoading(false);
    });
  }, [router]);

  async function createBranch(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        brandId: brandId || null,
        code: code.trim() || null,
      }),
    });
    if (res.ok) {
      const branch = await res.json();
      setBranches((prev) => [branch, ...prev]);
      setName("");
      setCode("");
    }
  }

  if (loading) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">แดชบอร์ดสาขา</h2>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h3 className="mb-3 font-semibold">เพิ่มสาขาใหม่</h3>
        <form onSubmit={createBranch} className="grid gap-3 md:grid-cols-4">
          <div>
            <label className={adminLabelClass}>ชื่อสาขา</label>
            <input
              className={adminInputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>แบรนด์</label>
            <select
              className={adminInputClass}
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">— ไม่ระบุ —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabelClass}>รหัสสาขา (URL)</label>
            <input
              className={adminInputClass}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="klong6"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white"
            >
              เพิ่มสาขา
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 space-y-3">
        <h3 className="font-semibold">สาขาทั้งหมด</h3>
        {branches.map((branch) => (
          <Link
            key={branch.id}
            href={`/admin/branches/${branch.id}`}
            className="block rounded-xl border bg-white p-4 hover:border-red-300"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900">{branch.name}</p>
                <p className="text-sm text-gray-500">
                  {branch.brand?.name ?? "ไม่มีแบรนด์"}
                  {branch.code && ` • /${branch.brand?.code ?? "?"}/${branch.code}`}
                </p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>เมนู {branch._count.menuItems}</p>
                <p>พื้นที่ส่ง {branch._count.deliveryLocations}</p>
                <p>ออเดอร์ {branch._count.orders}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

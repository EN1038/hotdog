"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logout } from "@/components/LoginForm";

type Branch = {
  id: string;
  name: string;
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
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/branches")
      .then((res) => {
        if (res.status === 401) {
          router.push("/admin/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setBranches(data);
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
      }),
    });
    if (res.ok) {
      const branch = await res.json();
      setBranches((prev) => [branch, ...prev]);
      setName("");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/admin/menu" className="text-red-600 hover:underline">
            จัดการเมนู
          </Link>
          <Link href="/admin/customers" className="text-red-600 hover:underline">
            ลูกค้า
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="text-gray-500 hover:underline"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <section className="mb-8 rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">เพิ่มสาขาใหม่</h2>
        <form onSubmit={createBranch} className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded border px-3 py-2"
            placeholder="ชื่อสาขา"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="md:col-span-2" />
          <button
            type="submit"
            className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            เพิ่มสาขา
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">สาขาทั้งหมด</h2>
        {branches.map((branch) => (
          <Link
            key={branch.id}
            href={`/admin/branches/${branch.id}`}
            className="block rounded-lg border bg-white p-4 hover:border-red-300"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{branch.name}</p>
                <p className="text-sm text-gray-500">
                  พนักงาน {branch._count.staff} คน
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
    </main>
  );
}

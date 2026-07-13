"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconBack } from "@/components/icons";

export default function AdminMenuPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>(
    [],
  );

  useEffect(() => {
    fetch("/api/admin/branches")
      .then((res) => (res.status === 401 ? null : res.json()))
      .then((data) => {
        if (!data) {
          router.push("/admin/login");
          return;
        }
        setBranches(data);
      });
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
        <IconBack size={16} />
        กลับ
      </Link>
      <h1 className="mt-2 text-2xl font-bold">จัดการเมนู (ต่อสาขา)</h1>
      <p className="text-sm text-gray-500">
        เมนูถูกผูกกับแต่ละสาขาแล้ว ให้เข้าไปจัดการในหน้ารายละเอียดสาขา
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {branches.map((b) => (
          <Link
            key={b.id}
            href={`/admin/branches/${b.id}`}
            className="rounded-lg border bg-white p-4 hover:border-red-300"
          >
            <p className="font-medium">{b.name}</p>
            <p className="text-sm text-gray-500">จัดการเมนูของสาขานี้</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

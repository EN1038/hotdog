"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconChevronRight, IconPackage } from "@/components/icons";
import { btnPrimaryXl } from "@/components/admin/AdminShell";

export default function AdminMenuPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/branches")
      .then((res) => (res.status === 401 ? null : res.json()))
      .then((data) => {
        if (!data) {
          router.push("/admin/login");
          return;
        }
        setBranches(data);
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">จัดการเมนู</h2>
      <p className="mt-1 text-sm text-gray-500">
        เมนูผูกกับแต่ละสาขา — เลือกสาขาเพื่อแก้ไขรายการอาหาร
      </p>

      {branches.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <IconPackage size={22} />
          </span>
          <p className="mt-3 font-medium text-gray-800">ยังไม่มีสาขา</p>
          <p className="mt-1 text-sm text-gray-500">
            สร้างสาขาก่อนที่แดชบอร์ด แล้วค่อยเพิ่มเมนู
          </p>
          <Link href="/admin" className={`mt-4 ${btnPrimaryXl}`}>
            ไปแดชบอร์ด
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/admin/branches/${b.id}`}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{b.name}</p>
                <p className="mt-0.5 text-sm text-gray-500">จัดการเมนูของสาขานี้</p>
              </div>
              <span className="text-gray-300 transition group-hover:text-red-500">
                <IconChevronRight size={18} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

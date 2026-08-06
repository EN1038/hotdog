"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** ค่าใช้จ่ายเปิดเป็น sheet จากหน้าหลัก — deep link กลับ /staff */
export default function StaffExpensesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/staff?expenses=1");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-sm font-semibold text-slate-500">
      กำลังเปิดค่าใช้จ่าย…
    </main>
  );
}

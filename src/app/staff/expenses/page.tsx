"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** ค่าใช้จ่ายย้ายไปเมนูบัญชีแล้ว — deep link ไป /staff/accounts */
export default function StaffExpensesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/staff/accounts?tab=expense");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-sm font-semibold text-slate-500">
      กำลังเปิดบัญชี…
    </main>
  );
}

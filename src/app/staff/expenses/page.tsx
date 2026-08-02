"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";

/** Staff expenses UI is temporarily disabled — admin-only for now. */
export default function StaffExpensesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/staff");
  }, [router]);

  return (
    <StaffAppShell active="home">
      <div className="px-4 py-12 text-center text-sm font-semibold text-slate-500">
        กำลังกลับหน้าหลัก…
      </div>
    </StaffAppShell>
  );
}

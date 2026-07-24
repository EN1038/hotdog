"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/LoadingState";
import { enableStaffKeyedOrder } from "@/lib/staff-keyed-order";

/** เปิด flow สั่งอาหารเดียวกับลูกค้า (/order/store → checkout) แล้วบันทึกผ่าน API พนักงาน */
export default function StaffNewOrderPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/staff/branding");
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.entryLocked || data.canEnter === false || data.canSell === false) {
        router.replace("/staff");
        return;
      }
      const branchId = data.branchId as string | undefined;
      if (!branchId) {
        router.replace("/staff");
        return;
      }
      enableStaffKeyedOrder();
      router.replace(`/order/store/${branchId}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <LoadingState className="w-full max-w-sm" label="กำลังเปิดหน้าสั่งอาหาร" />
    </main>
  );
}

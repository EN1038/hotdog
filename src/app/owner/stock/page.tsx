"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OwnerAppShell } from "@/components/owner/OwnerAppShell";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";
import { OwnerStockWorkspace } from "@/components/owner/OwnerStockWorkspace";

export default function OwnerStockPage() {
  const router = useRouter();
  useEffect(() => {
    if (!WAREHOUSE_UI_ENABLED) router.replace("/owner");
  }, [router]);

  if (!WAREHOUSE_UI_ENABLED) {
    return (
      <OwnerAppShell active="home">
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          กำลังกลับหน้าแรก…
        </div>
      </OwnerAppShell>
    );
  }
  return <OwnerStockWorkspace />;
}

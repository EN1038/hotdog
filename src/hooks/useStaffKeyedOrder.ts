"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearStaffKeyedOrder,
  isStaffKeyedOrderActive,
} from "@/lib/staff-keyed-order";

export type StaffKeyedOrderContext = {
  branchId: string;
  staffDisplayName: string;
  staffPhone: string;
  operatingDay: string;
  businessDayCutoffTime: string;
  lateEntryUntilTime: string | null;
};

export function useStaffKeyedOrder() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [context, setContext] = useState<StaffKeyedOrderContext | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isStaffKeyedOrderActive()) {
      setReady(true);
      return;
    }
    setActive(true);
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/staff/branding");
      if (cancelled) return;
      if (!res.ok) {
        clearStaffKeyedOrder();
        setActive(false);
        setReady(true);
        return;
      }
      const data = await res.json();
      if (!data.branchId) {
        clearStaffKeyedOrder();
        setActive(false);
        setReady(true);
        return;
      }
      if (data.entryLocked || data.canEnter === false) {
        clearStaffKeyedOrder();
        setActive(false);
        setReady(true);
        router.replace("/staff");
        return;
      }
      setContext({
        branchId: data.branchId,
        staffDisplayName: data.staffDisplayName ?? data.staffPhone ?? "",
        staffPhone: data.staffPhone ?? "",
        operatingDay:
          typeof data.operatingDay === "string" ? data.operatingDay : "",
        businessDayCutoffTime:
          typeof data.businessDayCutoffTime === "string"
            ? data.businessDayCutoffTime
            : "00:00",
        lateEntryUntilTime:
          typeof data.lateEntryUntilTime === "string"
            ? data.lateEntryUntilTime
            : null,
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { active, context, ready };
}

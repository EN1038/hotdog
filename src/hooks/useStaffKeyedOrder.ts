"use client";

import { useEffect, useState } from "react";
import {
  clearStaffKeyedOrder,
  isStaffKeyedOrderActive,
} from "@/lib/staff-keyed-order";

export type StaffKeyedOrderContext = {
  branchId: string;
  staffDisplayName: string;
  staffPhone: string;
};

export function useStaffKeyedOrder() {
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
      setContext({
        branchId: data.branchId,
        staffDisplayName: data.staffDisplayName ?? data.staffPhone ?? "",
        staffPhone: data.staffPhone ?? "",
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { active, context, ready };
}

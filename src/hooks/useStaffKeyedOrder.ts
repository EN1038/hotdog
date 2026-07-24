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
  canSell: boolean;
  activeShift: {
    roundNumber: number;
    openedAt: string;
    openingCash: number;
  } | null;
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
      const canSell = data.canSell !== false && data.canEnter !== false;
      if (!canSell || data.entryLocked) {
        clearStaffKeyedOrder();
        setActive(false);
        setReady(true);
        router.replace("/staff");
        return;
      }
      const activeShift =
        data.activeShift && typeof data.activeShift === "object"
          ? {
              roundNumber: Number(data.activeShift.roundNumber ?? 0),
              openedAt: String(data.activeShift.openedAt ?? ""),
              openingCash: Number(data.activeShift.openingCash ?? 0),
            }
          : null;
      setContext({
        branchId: data.branchId,
        staffDisplayName: data.staffDisplayName ?? data.staffPhone ?? "",
        staffPhone: data.staffPhone ?? "",
        operatingDay:
          typeof data.operatingDay === "string" ? data.operatingDay : "",
        canSell: true,
        activeShift,
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { active, context, ready };
}

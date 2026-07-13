"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { OrderData } from "@/lib/customer-types";
import { useCustomer } from "./CustomerProvider";
import {
  CustomerOrderHistoryList,
  OrderHistoryFilterBar,
  matchesOrderHistoryFilter,
  type OrderHistoryFilter,
} from "./CustomerOrderHistoryList";
import { IconRefresh } from "@/components/icons";

type StoreHistoryTabProps = {
  branchId: string;
};

export function StoreHistoryTab({ branchId }: StoreHistoryTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, sessionChecked } = useCustomer();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [filter, setFilter] = useState<OrderHistoryFilter>("ALL");

  const load = useCallback(async () => {
    const res = await fetch("/api/customer/orders");
    if (res.ok) {
      const data: OrderData[] = await res.json();
      setOrders(data.filter((o) => o.branch.id === branchId));
    }
  }, [branchId]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const filtered = useMemo(
    () => orders.filter((o) => matchesOrderHistoryFilter(o.status, filter)),
    [orders, filter],
  );

  function goToLogin() {
    const returnTo = pathname || `/order/store/${branchId}`;
    router.replace(
      `/order/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  if (!session && sessionChecked) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-gray-400">กรุณาเข้าสู่ระบบเพื่อดูประวัติ</p>
        <button
          type="button"
          onClick={goToLogin}
          className="mt-3 text-sm font-medium text-orange-500"
        >
          เข้าสู่ระบบ
        </button>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div>
      <div className="flex justify-end px-4 pt-2">
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 text-xs text-gray-500"
          aria-label="รีเฟรช"
        >
          <IconRefresh size={14} />
          รีเฟรช
        </button>
      </div>
      <OrderHistoryFilterBar filter={filter} onFilterChange={setFilter} />
      <CustomerOrderHistoryList
        orders={filtered}
        emptyMessage={
          orders.length === 0
            ? "ยังไม่มีประวัติการสั่งซื้อที่สาขานี้"
            : "ไม่มีคำสั่งซื้อในหมวดนี้"
        }
      />
    </div>
  );
}

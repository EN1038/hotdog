"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isActiveOrderStatus } from "@/lib/constants";
import type { OrderData } from "@/lib/customer-types";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { useCustomer } from "./CustomerProvider";
import {
  CustomerOrderHistoryList,
  OrderHistoryFilterBar,
  matchesOrderHistoryFilter,
  type OrderHistoryFilter,
} from "./CustomerOrderHistoryList";
import { IconRefresh } from "@/components/icons";
import { LoadingState } from "@/components/LoadingState";

type StoreHistoryTabProps = {
  branchId: string;
};

export function StoreHistoryTab({ branchId }: StoreHistoryTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, sessionChecked } = useCustomer();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [filter, setFilter] = useState<OrderHistoryFilter>("ALL");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetch("/api/customer/orders");
        if (res.ok) {
          const data: OrderData[] = await res.json();
          setOrders(data.filter((o) => o.branch.id === branchId));
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [branchId],
  );

  const silentRefresh = useCallback(() => load({ silent: true }), [load]);

  const hasActiveOrders = useMemo(
    () => orders.some((o) => isActiveOrderStatus(o.status)),
    [orders],
  );

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  usePollingRefresh(silentRefresh, {
    enabled: Boolean(session) && hasActiveOrders,
    intervalMs: 10_000,
  });

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

  if (!sessionChecked) {
    return (
      <LoadingState
        compact
        label="กำลังโหลดประวัติ"
        className="justify-center px-4 py-10"
      />
    );
  }

  if (!session) {
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

  if (loading && orders.length === 0) {
    return (
      <LoadingState
        compact
        label="กำลังโหลดประวัติ"
        className="justify-center px-4 py-10"
      />
    );
  }

  return (
    <div>
      <div className="flex justify-end px-4 pt-2">
        <button
          type="button"
          onClick={() => void load()}
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

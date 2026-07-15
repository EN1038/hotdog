"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrderData } from "@/lib/customer-types";
import { useCustomer } from "@/components/customer/CustomerProvider";
import {
  CustomerOrderHistoryList,
  OrderHistoryFilterBar,
  matchesOrderHistoryFilter,
  type OrderHistoryFilter,
} from "@/components/customer/CustomerOrderHistoryList";
import { IconBack, IconRefresh } from "@/components/icons";
import { LoadingState } from "@/components/LoadingState";

export default function HistoryPage() {
  const router = useRouter();
  const { session, sessionChecked } = useCustomer();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [filter, setFilter] = useState<OrderHistoryFilter>("ALL");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customer/orders");
      if (res.ok) setOrders(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  useEffect(() => {
    if (sessionChecked && !session) {
      router.replace(
        `/order/login?returnTo=${encodeURIComponent("/order/history")}`,
      );
    }
  }, [sessionChecked, session, router]);

  const filtered = useMemo(
    () => orders.filter((o) => matchesOrderHistoryFilter(o.status, filter)),
    [orders, filter],
  );

  if (!sessionChecked || (session && loading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6] px-4">
        <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f6] pb-8">
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/order"
              className="flex h-9 w-9 items-center justify-center text-gray-600"
              aria-label="กลับ"
            >
              <IconBack size={22} />
            </Link>
            <h1 className="font-bold text-gray-900">ประวัติการสั่งซื้อ</h1>
          </div>
          {session && (
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-sm text-gray-500"
              aria-label="รีเฟรช"
            >
              <IconRefresh size={16} />
              รีเฟรช
            </button>
          )}
        </div>
      </header>

      {session && (
        <>
          <OrderHistoryFilterBar
            filter={filter}
            onFilterChange={setFilter}
          />
          <CustomerOrderHistoryList orders={filtered} />
        </>
      )}
    </main>
  );
}

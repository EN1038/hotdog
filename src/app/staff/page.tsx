"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { OrderCard, StatusLegend, type OrderCardData } from "@/components/OrderCard";
import { logout } from "@/components/LoginForm";
import type { StaffRole } from "@/lib/constants";

export default function StaffPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderCardData[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [branchName, setBranchName] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    const res = await fetch("/api/staff/orders");
    if (res.status === 401) {
      router.push("/staff/login");
      return;
    }
    const data = await res.json();
    setOrders(data.orders ?? []);
    setRoles(data.roles ?? []);
    setBranchName(data.branchName ?? "");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    const res = await fetch(`/api/staff/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchOrders();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{branchName}</h1>
          <p className="text-sm text-gray-600">
            พนักงาน: {roles.join(", ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="text-sm text-gray-500 hover:underline"
        >
          ออกจากระบบ
        </button>
      </header>

      <div className="mb-4">
        <StatusLegend />
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg bg-white p-8 text-center text-gray-500">
          ไม่มีออเดอร์ที่รอดำเนินการ
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              roles={roles}
              showActions
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </main>
  );
}

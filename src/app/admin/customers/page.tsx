"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OrderCard, type OrderCardData } from "@/components/OrderCard";
import { IconBack } from "@/components/icons";

type Customer = {
  id: string;
  phone: string;
  orders: OrderCardData[];
};

export default function AdminCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");

  async function search(q = query) {
    const res = await fetch(
      `/api/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    );
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    setCustomers(await res.json());
  }

  useEffect(() => {
    search();
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
        <IconBack size={16} />
        กลับ
      </Link>
      <h1 className="mt-2 text-2xl font-bold">ค้นหาลูกค้า</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="ค้นหาเบอร์โทร..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="rounded bg-red-600 px-4 py-2 text-white"
        >
          ค้นหา
        </button>
      </form>

      <div className="mt-6 space-y-6">
        {customers.map((customer) => (
          <section key={customer.id} className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold">เบอร์ {customer.phone}</h2>
            <p className="text-sm text-gray-500">
              {customer.orders.length} ออเดอร์
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {customer.orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

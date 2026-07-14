"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OrderCard, type OrderCardData } from "@/components/OrderCard";
import { IconBack } from "@/components/icons";
import { PhoneInput } from "@/components/PhoneInput";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { formatThaiPhone, phoneDigits } from "@/lib/constants";
import {
  adminInputClass,
  btnPrimary,
} from "@/components/admin/AdminShell";

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
    <div>
      <h2 className="text-xl font-bold text-gray-900">ค้นหาลูกค้า</h2>
      <p className="mt-1 text-sm text-gray-600">
        ค้นหาจากเบอร์โทร แล้วโทรออกจากรายการได้เลย
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(phoneDigits(query));
        }}
        className="mt-4 flex flex-wrap gap-2"
      >
        <div className="min-w-[14rem] flex-1">
          <PhoneInput
            value={query}
            onChange={setQuery}
            className={adminInputClass}
            placeholder="ค้นหาเบอร์โทร..."
            required={false}
          />
        </div>
        <button type="submit" className={btnPrimary}>
          ค้นหา
        </button>
      </form>

      <div className="mt-6 space-y-6">
        {customers.map((customer) => (
          <section
            key={customer.id}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">
                  เบอร์ {formatThaiPhone(customer.phone)}
                </h3>
                <p className="text-sm text-gray-600">
                  {customer.orders.length} ออเดอร์
                </p>
              </div>
              <PhoneCallButton phone={customer.phone} showNumber />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {customer.orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

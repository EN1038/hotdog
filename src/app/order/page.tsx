"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { OrderCard, type OrderCardData } from "@/components/OrderCard";

type BranchMenu = {
  id: string;
  name: string;
  price: string;
  description: string | null;
};

type Branch = {
  id: string;
  name: string;
  menuItems: BranchMenu[];
  deliveryLocations: { id: string; name: string }[];
};

type CartItem = {
  branchMenuItemId: string;
  name: string;
  price: number;
  quantity: number;
};

export default function CustomerOrderPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "app">("phone");
  const [tab, setTab] = useState<"menu" | "history">("menu");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [orders, setOrders] = useState<OrderCardData[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [message, setMessage] = useState("");

  const checkSession = useCallback(async () => {
    const res = await fetch("/api/auth/session");
    const data = await res.json();
    if (data.session?.type === "customer") {
      setStep("app");
    }
  }, []);

  const loadData = useCallback(async () => {
    const [branchRes, orderRes] = await Promise.all([
      fetch("/api/customer/branches"),
      fetch("/api/customer/orders"),
    ]);
    if (orderRes.status === 401) {
      setStep("phone");
      return;
    }
    setBranches(await branchRes.json());
    setOrders(await orderRes.json());
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (step === "app") loadData();
  }, [step, loadData]);

  function addToCart(menu: BranchMenu) {
    setCart((prev) => {
      const existing = prev.find((c) => c.branchMenuItemId === menu.id);
      if (existing) {
        return prev.map((c) =>
          c.branchMenuItemId === menu.id
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        );
      }
      return [
        ...prev,
        {
          branchMenuItemId: menu.id,
          name: menu.name,
          price: Number(menu.price),
          quantity: 1,
        },
      ];
    });
  }

  function updateQty(branchMenuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.branchMenuItemId === branchMenuItemId
            ? { ...c, quantity: c.quantity + delta }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  }

  const branch = branches.find((b) => b.id === selectedBranch);
  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  async function submitOrder() {
    if (!selectedBranch || !selectedLocation || !addressDetail.trim()) {
      setMessage("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    const res = await fetch("/api/customer/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: selectedBranch,
        deliveryLocationId: selectedLocation,
        addressDetail,
        items: cart.map((c) => ({
          branchMenuItemId: c.branchMenuItemId,
          quantity: c.quantity,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "สั่งไม่สำเร็จ");
      return;
    }
    setCart([]);
    setShowCheckout(false);
    setAddressDetail("");
    setSelectedLocation("");
    setSelectedBranch("");
    setMessage("สั่งสำเร็จ!");
    loadData();
    setTab("history");
  }

  if (step === "phone") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-red-700">สั่งหมาล่า</h1>
          <p className="text-sm text-gray-600">กรอกเบอร์โทรเพื่อติดตามออเดอร์</p>
        </div>
        <LoginForm
          type="customer"
          title="เริ่มสั่งอาหาร"
          redirectTo="/order"
        />
        <Link href="/" className="mt-4 text-sm text-gray-500 hover:underline">
          กลับหน้าหลัก
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-red-700">สั่งหมาล่า</h1>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              setStep("phone");
              router.refresh();
            }}
            className="text-sm text-gray-500"
          >
            เปลี่ยนเบอร์
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("menu")}
            className={`flex-1 rounded py-2 text-sm font-medium ${
              tab === "menu"
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            รายการ
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex-1 rounded py-2 text-sm font-medium ${
              tab === "history"
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            ประวัติ
          </button>
        </div>
      </header>

      {message && (
        <p className="bg-green-50 px-4 py-2 text-center text-sm text-green-700">
          {message}
        </p>
      )}

      {tab === "menu" ? (
        <div className="p-4 pb-24">
          {branches.map((b) => (
            <section key={b.id} className="mb-6">
              <h2 className="mb-2 font-semibold text-gray-900">{b.name}</h2>
              <div className="space-y-2">
                {b.menuItems.map((bm) => (
                  <div
                    key={bm.id}
                    className="flex items-center justify-between rounded-lg border bg-white p-3"
                  >
                    <div>
                      <p className="font-medium">{bm.name}</p>
                      <p className="text-sm text-gray-500">
                        {Number(bm.price).toLocaleString("th-TH")} บาท
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addToCart(bm)}
                      className="rounded bg-red-600 px-3 py-1 text-sm text-white"
                    >
                      เพิ่ม
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {orders.length === 0 ? (
            <p className="text-center text-gray-500">ยังไม่มีประวัติการสั่ง</p>
          ) : (
            orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </div>
      )}

      {tab === "menu" && cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg">
          <div className="mb-2 max-h-32 overflow-y-auto text-sm">
            {cart.map((c) => (
              <div
                key={c.branchMenuItemId}
                className="flex items-center justify-between py-1"
              >
                <span>
                  {c.name} x{c.quantity}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateQty(c.branchMenuItemId, -1)}
                    className="h-6 w-6 rounded border"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => updateQty(c.branchMenuItemId, 1)}
                    className="h-6 w-6 rounded border"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setShowCheckout(true);
            }}
            className="w-full rounded bg-red-600 py-3 font-medium text-white"
          >
            ยืนยันสั่ง ({cartTotal.toLocaleString("th-TH")} บาท)
          </button>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-4 sm:max-w-md sm:rounded-xl">
            <h2 className="mb-4 text-lg font-bold">ยืนยันการสั่ง</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  เลือกสาขา
                </label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setSelectedLocation("");
                  }}
                >
                  <option value="">-- เลือกสาขา --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              {branch && (
                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    พื้นที่จัดส่ง
                  </label>
                  <select
                    className="w-full rounded border px-3 py-2"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                  >
                    <option value="">-- เลือกพื้นที่ --</option>
                    {branch.deliveryLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  รายละเอียดที่อยู่ / จุดสังเกต
                </label>
                <textarea
                  className="w-full rounded border px-3 py-2"
                  rows={3}
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="เช่น ห้อง 302 ตึก B ประตูสีแดง"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="flex-1 rounded border py-2"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submitOrder}
                className="flex-1 rounded bg-red-600 py-2 text-white"
              >
                สั่งเลย
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";

type Product = { id: string; name: string; unit: string };
type RequestRow = {
  id: string;
  quantityRequested: number;
  status: string;
  createdAt: string;
  product: { name: string; unit: string };
  note: string | null;
};

const STATUS: Record<string, string> = {
  PENDING: "รอครัวจัด",
  FULFILLED: "จัดส่งแล้ว",
  REJECTED: "ปฏิเสธ",
  CANCELLED: "ยกเลิก",
};

export default function StaffStockRequestPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("10");
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/staff/stock/requests");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "โหลดไม่สำเร็จ");
      setProducts(body.products ?? []);
      setRequests(body.requests ?? []);
      if (!productId && body.products?.[0]) {
        setProductId(body.products[0].id);
      }
    } catch (e) {
      toast.error(
        "โหลดคำขอไม่สำเร็จ",
        e instanceof Error ? e.message : "ลองใหม่",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    const quantityRequested = Number(qty);
    if (!productId || quantityRequested <= 0) {
      toast.error("เลือกสินค้าและจำนวน");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/staff/stock/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandProductId: productId,
          quantityRequested,
          note: note.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "ส่งไม่สำเร็จ");
      toast.success("ส่งคำขอไปครัวแล้ว");
      setNote("");
      await load();
    } catch (e) {
      toast.error("ส่งคำขอไม่สำเร็จ", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <StaffAppShell active="stock">
        <LoadingState />
      </StaffAppShell>
    );
  }

  return (
    <StaffAppShell active="stock">
      <div className="space-y-4 px-4 pb-8 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-extrabold text-gray-900">
              ขอของจากครัว
            </h1>
            <p className="text-xs text-gray-500">
              แจ้งยอดที่ต้องการให้บ้านกลางผลิต/จัดส่ง
            </p>
          </div>
          <Link
            href="/staff/stock"
            className="text-sm font-semibold text-blue-700"
          >
            กลับสต๊อก
          </Link>
        </div>

        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <label className="block text-xs font-semibold text-gray-600">
            เมนู
            <select
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            จำนวน
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            หมายเหตุ
            <input
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น พรุ่งนี้เช้า"
            />
          </label>
          <button
            type="button"
            disabled={busy || products.length === 0}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "กำลังส่ง…" : "ส่งคำขอ"}
          </button>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-gray-900">คำขอล่าสุด</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-gray-500">ยังไม่มีคำขอ</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {requests.map((r) => (
                <li key={r.id} className="py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {r.product.name} ×{r.quantityRequested}
                    </span>
                    <span className="text-xs text-gray-500">
                      {STATUS[r.status] ?? r.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(r.createdAt).toLocaleString("th-TH")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </StaffAppShell>
  );
}

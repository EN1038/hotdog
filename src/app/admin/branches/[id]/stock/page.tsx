"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminSelectClass,
  btnDanger,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

type Product = {
  id: string;
  name: string;
  unit: string;
};

type MenuItem = {
  id: string;
  name: string;
  brandProductId: string | null;
  isOutOfStock: boolean;
  isHidden: boolean;
};

type StockPayload = {
  branch: {
    id: string;
    name: string;
    code: string | null;
    brandId: string | null;
    stockEnabled: boolean;
    brand: {
      id: string;
      name: string;
      code: string;
      stockEnabled: boolean;
    } | null;
  };
  stockActive: boolean;
  location: {
    id: string;
    balances: {
      id: string;
      quantity: number;
      product: Product;
    }[];
  } | null;
  products: Product[];
  menuItems: MenuItem[];
};

export default function BranchStockPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { loaded } = useAdminSession();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [data, setData] = useState<StockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkDraft, setLinkDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/branches/${id}/stock`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      router.replace("/admin");
      return;
    }
    const json = (await res.json()) as StockPayload;
    setData(json);
    const draft: Record<string, string> = {};
    for (const item of json.menuItems) {
      draft[item.id] = item.brandProductId ?? "";
    }
    setLinkDraft(draft);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    if (!loaded) return;
    void load();
  }, [loaded, load]);

  async function toggleStock(enabled: boolean) {
    if (!data) return;
    if (!enabled) {
      const ok = await confirm({
        title: "ปิดสต๊อกสาขานี้?",
        message: "จะไม่ตัดจำนวนตอนรับออเดอร์ แต่ยังสลับหมด/ยังมีมือได้",
        confirmLabel: "ปิดสต๊อก",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/branches/${id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockEnabled: enabled }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(enabled ? "เปิดสต๊อกสาขาแล้ว" : "ปิดสต๊อกสาขาแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveLink(menuItemId: string) {
    const brandProductId = linkDraft[menuItemId] || null;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${id}/menu-items/${menuItemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandProductId }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ผูกเมนูไม่สำเร็จ", body.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("บันทึกการผูกเมนูแล้ว");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || loading || !data) {
    return <AdminLoadingState />;
  }

  const { branch, stockActive, location, products, menuItems } = data;
  const brandStockOn = Boolean(branch.brand?.stockEnabled);
  const canEnable = Boolean(branch.brandId && brandStockOn);

  return (
    <div>
      <AdminPageHeader
        title={`สต๊อกสาขา · ${branch.name}`}
        description={
          branch.brand
            ? `ภายใต้แบรนด์ ${branch.brand.name} — ตัดจำนวนตอนรับออเดอร์`
            : "สาขานี้ไม่มีแบรนด์ จึงใช้สต๊อกจำนวนไม่ได้"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {branch.brandId && (
              <Link
                href={`/admin/brands/${branch.brandId}/stock`}
                className={btnOutline}
              >
                บ้านกลาง
              </Link>
            )}
            <Link href={`/admin/branches/${id}`} className={btnOutline}>
              กลับสาขา
            </Link>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            ระบบสต๊อกสาขา
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {!branch.brandId
              ? "ต้องอยู่ใต้แบรนด์ก่อน"
              : !brandStockOn
                ? "เปิดสต๊อกที่แบรนด์ก่อน แล้วค่อยเปิดที่สาขานี้"
                : branch.stockEnabled
                  ? stockActive
                    ? "เปิดอยู่ — ตัดสต๊อกเมื่อรับออเดอร์ (เมนูที่ผูกสินค้าแล้ว)"
                    : "เปิดธงแล้ว แต่ยังไม่พร้อมใช้งาน"
                  : "ปิดอยู่ — ใช้ระบบเดิมได้ตามปกติ"}
          </p>
        </div>
        {branch.stockEnabled ? (
          <button
            type="button"
            disabled={busy}
            className={`${btnDanger} shrink-0`}
            onClick={() => void toggleStock(false)}
          >
            ปิดใช้งานสต๊อก
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canEnable}
            className={`${btnPrimary} shrink-0 disabled:opacity-50`}
            onClick={() => void toggleStock(true)}
          >
            เปิดใช้งานสต๊อก
          </button>
        )}
      </div>

      {!branch.brandId ? (
        <AdminEmptyState
          title="สาขาไม่มีแบรนด์"
          description="ผูกสาขากับแบรนด์ก่อน แล้วเปิดสต๊อกที่แบรนด์และสาขา"
        />
      ) : !brandStockOn ? (
        <AdminEmptyState
          title="แบรนด์ยังไม่เปิดสต๊อก"
          description="ไปเปิดที่หน้าบ้านกลางของแบรนด์ก่อน"
          action={
            <Link
              href={`/admin/brands/${branch.brandId}/stock`}
              className={btnPrimary}
            >
              ไปหน้าสต๊อกแบรนด์
            </Link>
          }
        />
      ) : !branch.stockEnabled ? (
        <AdminEmptyState
          title="ยังไม่ได้เปิดสต๊อกสาขานี้"
          description="กดเปิดใช้งานด้านบนเมื่อสาขานี้ต้องการนับจำนวน"
        />
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              ยอดคงเหลือที่สาขา
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              โอนจากบ้านกลางมาที่หน้าสต๊อกแบรนด์
            </p>
            <ul className="mt-4 divide-y divide-slate-100">
              {(location?.balances ?? []).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-sm text-slate-800">
                    {b.product.name}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold ${
                      b.quantity <= 0 ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {b.quantity} {b.product.unit}
                  </span>
                </li>
              ))}
              {(location?.balances?.length ?? 0) === 0 && (
                <li className="py-3 text-sm text-slate-500">
                  ยังไม่มีของที่สาขา — โอนจากบ้านกลาง
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              ผูกเมนูกับสินค้าสต๊อก
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              เมนูที่ผูกแล้วจะตัดจำนวนตอนรับออเดอร์ — เมนูที่ไม่ผูกใช้หมด/ยังมีมือได้
            </p>
            <ul className="mt-4 divide-y divide-slate-100">
              {menuItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 py-3"
                >
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.isOutOfStock ? "หมด" : "มีของ"}
                      {item.isHidden ? " · ซ่อนเมนู" : ""}
                    </p>
                  </div>
                  <select
                    className={`${adminSelectClass} max-w-xs flex-1`}
                    value={linkDraft[item.id] ?? ""}
                    onChange={(e) =>
                      setLinkDraft((d) => ({
                        ...d,
                        [item.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">ไม่ผูก (มือ)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (linkDraft[item.id] ?? "") ===
                        (item.brandProductId ?? "")
                    }
                    className={`${btnOutline} disabled:opacity-40`}
                    onClick={() => void saveLink(item.id)}
                  >
                    บันทึก
                  </button>
                </li>
              ))}
              {menuItems.length === 0 && (
                <li className="py-3 text-sm text-slate-500">ยังไม่มีเมนู</li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

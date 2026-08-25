"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminPageHeader,
  AdminLoadingState,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";

type BrandItem = {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  stockEnabled: boolean;
};

export default function AdminStockQuickAccessPage() {
  const router = useRouter();
  const { loaded } = useAdminSession();
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    if (!WAREHOUSE_UI_ENABLED) {
      setLoading(false);
      return;
    }
    fetch("/api/admin/brands")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: BrandItem[]) => {
      setBrands(data);
      if (data.length === 1) {
        router.replace(`/admin/brands/${data[0].id}/stock`);
      } else {
        setLoading(false);
      }
    })
    .catch(() => setLoading(false));
  }, [loaded, router]);

  if (!WAREHOUSE_UI_ENABLED) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-lg font-extrabold text-slate-900">
            ฟีเจอร์นี้ยังไม่เปิดใช้
          </p>
          <p className="mt-2 text-sm font-medium text-slate-600">
            ใช้รับเข้า–จ่ายออกที่สต๊อกสาขาได้เลย
          </p>
          <Link
            href="/admin"
            className={`${btnPrimary} mt-6 inline-flex min-h-11 items-center justify-center px-5`}
          >
            กลับแดชบอร์ด
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <AdminLoadingState className="py-12" />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="สต๊อกกลาง"
        description="เลือกแบรนด์ที่ต้องการเข้าไปบริหารจัดการและดูรายงานสต๊อกคลังสต๊อกกลาง"
      />

      {brands.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200">
          <p className="text-sm font-bold text-slate-800">ไม่พบรายการแบรนด์ที่คุณเป็นผู้ดูแล</p>
          <p className="text-xs text-slate-500 mt-1">
            กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การใช้งานสต๊อกแบรนด์
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <div
              key={brand.id}
              className="group relative flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm border border-slate-200/80 transition hover:shadow-md hover:border-slate-300"
            >
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
                  {brand.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={brand.logoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-extrabold text-slate-400 text-base">
                      {brand.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-extrabold text-slate-900">
                    {brand.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    รหัสแบรนด์: {brand.code}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    brand.stockEnabled ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {brand.stockEnabled ? "● เปิดสต๊อกแล้ว" : "○ ยังไม่เปิดสต๊อก"}
                </span>

                <Link
                  href={`/admin/brands/${brand.id}/stock`}
                  className={`${btnPrimary} text-xs py-1.5`}
                >
                  จัดการสต๊อกกลาง 🏢
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

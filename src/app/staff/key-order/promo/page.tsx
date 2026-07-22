"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StaffKeyOrderLayout } from "@/components/staff/StaffKeyOrderLayout";
import {
  StaffRoundGateLoading,
  StaffRoundStatusStrip,
  useStaffRoundGate,
} from "@/components/staff/StaffRoundGate";
import { formatPrice } from "@/lib/constants";
import type { MenuItemData } from "@/lib/customer-types";
import { resolveSellPrice } from "@/lib/menu-pricing";
import { isPromoMenuItem } from "@/lib/staff-key-order";

export default function StaffPromoKeyOrderIndexPage() {
  const router = useRouter();
  const {
    state: roundState,
    loading: roundLoading,
    blocked,
  } = useStaffRoundGate();
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItemData[]>([]);

  useEffect(() => {
    if (blocked || roundLoading || !roundState) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/staff/menu?channel=storefront");
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      const items = Array.isArray(data.menuItems)
        ? (data.menuItems as MenuItemData[])
        : [];
      setBranchName(data.branchName ?? "");
      setMenuItems(items);
      setLoading(false);

      const promos = items.filter(
        (item) => isPromoMenuItem(item) && !item.isOutOfStock,
      );
      if (promos.length === 1) {
        router.replace(`/staff/key-order/promo/${promos[0]!.id}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, blocked, roundLoading, roundState]);

  const promoItems = useMemo(
    () =>
      menuItems.filter((item) => isPromoMenuItem(item) && !item.isOutOfStock),
    [menuItems],
  );

  if (blocked || roundLoading || !roundState || loading) {
    return <StaffRoundGateLoading label="กำลังโหลดโปรโมชั่น" />;
  }

  if (promoItems.length === 1) {
    return <StaffRoundGateLoading label="กำลังเปิดโปรโมชั่น" />;
  }

  return (
    <StaffKeyOrderLayout
      title="คีย์ออเดอร์แบบโปรโมชั่น"
      subtitle={branchName || undefined}
    >
      <StaffRoundStatusStrip state={roundState} />

      {promoItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-800">
            ยังไม่มีเมนูโปรโมชั่นในสาขานี้
          </p>
          <p className="mt-1 text-xs text-gray-500">
            โปรโมชั่นคือเมนูที่มีตัวเลือกแบบเลือกจากเมนู (โปรเลือกไม้)
          </p>
          <Link
            href="/staff/key-order/regular"
            className="mt-4 inline-flex rounded-xl bg-site-primary px-4 py-2.5 text-sm font-bold text-white"
          >
            ไปคีย์แบบธรรมดา
          </Link>
        </div>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">
            เลือกโปรโมชั่น
          </h2>
          <p className="mb-3 text-xs text-gray-500">
            มี {promoItems.length} รายการ — กดเพื่อกรอกในหน้าเดียว
          </p>
          <ul className="divide-y divide-gray-100">
            {promoItems.map((item) => {
              const price = resolveSellPrice(item, "pickup").final;
              return (
                <li key={item.id}>
                  <Link
                    href={`/staff/key-order/promo/${item.id}`}
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatPrice(price)}฿
                        {item.optionGroups?.some((g) => g.mode === "FROM_MENU")
                          ? ` · เลือก ${
                              item.optionGroups.find(
                                (g) => g.mode === "FROM_MENU",
                              )?.maxSelect ?? ""
                            } ไม้`
                          : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-site-primary">
                      เลือก
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </StaffKeyOrderLayout>
  );
}

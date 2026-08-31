"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StaffKeyOrderLayout } from "@/components/staff/StaffKeyOrderLayout";
import {
  StaffRoundGateLoading,
  useStaffRoundGate,
} from "@/components/staff/StaffRoundGate";
import { formatPrice } from "@/lib/constants";
import type { MenuItemData } from "@/lib/customer-types";
import { resolveSellPrice } from "@/lib/menu-pricing";
import {
  describePromoMenuItem,
  isPromoSellableOnShop,
  isStockExemptMenuItem,
  listVisiblePromoMenuItems,
  promoScheduleStatusOf,
} from "@/lib/staff-key-order";
import { PROMO_SCHEDULE_STATUS_LABEL } from "@/lib/promo-schedule";
import { assignStableMenuSequence } from "@/lib/staff-menu-order";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

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

      const promos = listVisiblePromoMenuItems(items).filter((item) =>
        isPromoSellableOnShop(item),
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
    () => listVisiblePromoMenuItems(menuItems),
    [menuItems],
  );

  const promoSeqById = useMemo(
    () => assignStableMenuSequence(promoItems),
    [promoItems],
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
      {promoItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <p className="text-[17px] font-extrabold text-slate-900">
            ยังไม่มีเมนูโปรโมชั่นในสาขานี้
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
            โปรโมชั่นคือเมนูที่มีตัวเลือกแบบเลือกจากเมนู (โปรเลือกไม้)
          </p>
          <Link
            href="/staff/key-order/regular"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-site-primary px-5 text-[15px] font-extrabold text-white"
          >
            ไปคีย์แบบธรรมดา
          </Link>
        </div>
      ) : (
        <section className="space-y-3">
          <header className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[18px] font-extrabold text-slate-900">
                เลือกโปรโมชั่น
              </h2>
              <p className="mt-1 text-[13px] font-medium text-slate-500">
                แตะการ์ดเพื่อคีย์ · มี {promoItems.length} รายการ
              </p>
            </div>
            <Link
              href="/staff/settings/promos"
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 ring-1 ring-slate-200"
            >
              จัดการวันหมด
            </Link>
          </header>

          <div className="grid grid-cols-1 gap-3">
            {promoItems.map((item, index) => {
              const price = resolveSellPrice(item, "pickup").final;
              const seq = promoSeqById.get(item.id) ?? index + 1;
              const stockLeft =
                !isStockExemptMenuItem(item) && item.stockQuantity != null
                  ? item.stockQuantity
                  : null;
              const status = promoScheduleStatusOf(item);
              const sellable = isPromoSellableOnShop(item);
              const tone = !sellable
                ? "from-slate-400 to-slate-500"
                : index % 3 === 0
                  ? "from-amber-500 to-orange-500"
                  : index % 3 === 1
                    ? "from-sky-500 to-blue-600"
                    : "from-emerald-500 to-teal-600";

              const cardClass = `relative flex min-h-[6.5rem] items-center gap-3.5 overflow-hidden rounded-2xl bg-gradient-to-br ${tone} px-4 py-4 text-white shadow-sm transition ${
                sellable ? "active:scale-[0.98]" : "opacity-90"
              }`;

              const body = (
                <>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-[18px] font-black tabular-nums">
                    {seq}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[18px] font-black leading-snug">
                      {item.itemCode?.trim() ? (
                        <span className="mr-2 rounded bg-white/25 px-2 py-0.5 text-[13px] font-black tabular-nums">
                          {resolveMenuItemProductCode({
                            id: item.id,
                            itemCode: item.itemCode,
                          })}
                        </span>
                      ) : null}
                      {item.name}
                    </span>
                    <span className="mt-1 block text-[14px] font-medium text-white/90">
                      {describePromoMenuItem(item)}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-white/85">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[14px] font-black tabular-nums">
                        {formatPrice(price)}฿
                      </span>
                      {stockLeft != null ? (
                        <span>เหลือ {stockLeft}</span>
                      ) : null}
                      {!sellable ? (
                        <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-[12px] font-bold">
                          {PROMO_SCHEDULE_STATUS_LABEL[status]}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex h-11 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[14px] font-extrabold text-slate-900">
                    {sellable ? "เลือก" : "หมดแล้ว"}
                  </span>
                </>
              );

              return sellable ? (
                <Link
                  key={item.id}
                  href={`/staff/key-order/promo/${item.id}`}
                  className={cardClass}
                >
                  {body}
                </Link>
              ) : (
                <div key={item.id} className={cardClass} aria-disabled>
                  {body}
                </div>
              );
            })}
          </div>

          <Link
            href="/staff/key-order/regular"
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-[14px] font-bold text-slate-600"
          >
            คีย์แบบธรรมดาแทน
          </Link>
        </section>
      )}
    </StaffKeyOrderLayout>
  );
}

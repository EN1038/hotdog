"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { StaffKeyOrderLayout } from "@/components/staff/StaffKeyOrderLayout";
import {
  StaffRoundGateLoading,
  StaffRoundStatusStrip,
  useStaffRoundGate,
} from "@/components/staff/StaffRoundGate";
import {
  StaffQuickFulfillment,
  emptyStaffFulfillment,
  validateStaffFulfillment,
  type StaffFulfillmentState,
} from "@/components/staff/StaffQuickFulfillment";
import { MenuOptionGroupPicker } from "@/components/customer/MenuOptionGroupPicker";
import { formatPrice } from "@/lib/constants";
import type { MenuItemData } from "@/lib/customer-types";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import {
  isPromoMenuItem,
  orderOptionGroupsForStaffPromo,
  type StaffDeliveryLocation,
} from "@/lib/staff-key-order";
import {
  validateOptionGroupSelections,
  type SelectedByGroup,
} from "@/lib/option-selection";

export default function StaffPromoKeyOrderDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const router = useRouter();
  const {
    state: roundState,
    loading: roundLoading,
    blocked,
  } = useStaffRoundGate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [branchName, setBranchName] = useState("");
  const [item, setItem] = useState<MenuItemData | null>(null);
  const [promoCount, setPromoCount] = useState(0);
  const [deliveryLocations, setDeliveryLocations] = useState<
    StaffDeliveryLocation[]
  >([]);
  const [quantity, setQuantity] = useState(1);
  const [selectedByGroup, setSelectedByGroup] = useState<SelectedByGroup>({});
  const [optionErrorGroupId, setOptionErrorGroupId] = useState<string | null>(
    null,
  );
  const [fulfillment, setFulfillment] = useState<StaffFulfillmentState>(
    emptyStaffFulfillment,
  );

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
      const promos = items.filter(
        (m) => isPromoMenuItem(m) && !m.isOutOfStock,
      );
      const found = promos.find((m) => m.id === itemId) ?? null;
      setBranchName(data.branchName ?? "");
      setPromoCount(promos.length);
      setItem(found);
      setDeliveryLocations(
        Array.isArray(data.deliveryLocations) ? data.deliveryLocations : [],
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, router, blocked, roundLoading, roundState]);

  const channel = fulfillmentToChannel(fulfillment.fulfillmentType);

  const orderedGroups = useMemo(
    () => orderOptionGroupsForStaffPromo(item?.optionGroups ?? []),
    [item],
  );

  const canSell = useMemo(() => {
    if (!item) return false;
    return isChannelSellEnabled(item, channel) && !item.isOutOfStock;
  }, [item, channel]);

  const unitPrice = item ? resolveSellPrice(item, channel).final : 0;

  async function submit() {
    if (!item) return;
    setError("");
    setOptionErrorGroupId(null);

    if (!canSell) {
      setError("เมนูนี้ไม่พร้อมขายในช่องทางที่เลือก");
      return;
    }

    const result = validateOptionGroupSelections(
      item.optionGroups ?? [],
      selectedByGroup,
    );
    if (result) {
      setError(result.error);
      setOptionErrorGroupId(result.groupId);
      return;
    }

    const fulfillErr = validateStaffFulfillment(fulfillment, deliveryLocations);
    if (fulfillErr) {
      setError(fulfillErr);
      return;
    }

    setSubmitting(true);
    try {
      const optionIds = (item.optionGroups ?? []).flatMap(
        (g) => selectedByGroup[g.id] ?? [],
      );
      const body: Record<string, unknown> = {
        fulfillmentType: fulfillment.fulfillmentType,
        paymentMethod: fulfillment.paymentMethod,
        note: fulfillment.note.trim() || undefined,
        items: [
          {
            branchMenuItemId: item.id,
            quantity,
            optionIds,
          },
        ],
      };
      if (fulfillment.fulfillmentType === "DELIVERY") {
        body.deliveryLocationId = fulfillment.deliveryLocationId;
        body.addressDetail = fulfillment.addressDetail.trim();
        const loc = deliveryLocations.find(
          (l) => l.id === fulfillment.deliveryLocationId,
        );
        if (loc?.isCustomAddress) {
          body.deliveryLatitude = fulfillment.mapPin.latitude;
          body.deliveryLongitude = fulfillment.mapPin.longitude;
        }
      }

      const res = await fetch("/api/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      router.replace("/staff");
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  if (blocked || roundLoading || !roundState || loading) {
    return <StaffRoundGateLoading label="กำลังโหลดโปรโมชั่น" />;
  }

  if (!item) {
    return (
      <StaffKeyOrderLayout title="คีย์ออเดอร์แบบโปรโมชั่น">
        <StaffRoundStatusStrip state={roundState} />
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-800">
            ไม่พบโปรโมชั่นนี้
          </p>
          <Link
            href="/staff/key-order/promo"
            className="mt-4 inline-flex text-sm font-semibold text-site-primary underline"
          >
            กลับไปเลือกรายการโปร
          </Link>
        </div>
      </StaffKeyOrderLayout>
    );
  }

  return (
    <StaffKeyOrderLayout
      title={item.name}
      subtitle={branchName || "คีย์ออเดอร์แบบโปรโมชั่น"}
      footer={
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {submitting
            ? "กำลังบันทึก…"
            : `บันทึกออเดอร์ · ${formatPrice(unitPrice * quantity)}฿`}
        </button>
      }
    >
      <StaffRoundStatusStrip state={roundState} />

      {promoCount > 1 ? (
        <Link
          href="/staff/key-order/promo"
          className="inline-flex text-xs font-semibold text-site-primary underline"
        >
          เปลี่ยนโปรโมชั่น
        </Link>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug text-gray-900">
              {item.name}
            </p>
            <p className="text-xs text-gray-500">
              {formatPrice(unitPrice)}฿ / ชุด
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold disabled:opacity-40"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-bold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-site-primary text-lg font-bold text-white"
              >
                +
              </button>
              <span className="text-xs text-gray-500">ชุด</span>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full min-w-0 space-y-3">
        <p className="text-xs text-gray-500">
          กรอกตามลำดับด้านล่าง แล้วบันทึกได้ในหน้านี้
        </p>
        {orderedGroups.map((group) => {
          const isPack = group.mode === "FROM_MENU";
          return (
            <section
              key={group.id}
              className={`w-full min-w-0 max-w-full rounded-2xl border p-3 ${
                isPack
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  {group.name}
                </h2>
                {isPack ? (
                  <p className="text-xs text-gray-600">เลือกไม้ในชุดโปร</p>
                ) : null}
              </div>
              <MenuOptionGroupPicker
                group={group}
                compact
                selectedIds={selectedByGroup[group.id] ?? []}
                highlightError={optionErrorGroupId === group.id}
                onChange={(ids) =>
                  setSelectedByGroup((prev) => ({
                    ...prev,
                    [group.id]: ids,
                  }))
                }
              />
            </section>
          );
        })}
      </div>

      <StaffQuickFulfillment
        value={fulfillment}
        onChange={setFulfillment}
        deliveryLocations={deliveryLocations}
      />

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </StaffKeyOrderLayout>
  );
}

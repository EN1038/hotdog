"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { StaffKeyOrderLayout, STAFF_KEY_ORDER_STICKY_OFFSET } from "@/components/staff/StaffKeyOrderLayout";
import {
  StaffRoundGateLoading,
  useStaffRoundGate,
} from "@/components/staff/StaffRoundGate";
import {
  StaffQuickFulfillment,
  emptyStaffFulfillment,
  validateStaffFulfillment,
  type StaffFulfillmentState,
} from "@/components/staff/StaffQuickFulfillment";
import {
  StaffConsumablePicker,
  requiresConsumableSelection,
  selectedConsumableTotal,
  type StaffConsumableItem,
} from "@/components/staff/StaffConsumablePicker";
import {
  StaffKeyOrderAlertModal,
  StaffKeyOrderSuccessModal,
  StaffOrderSummary,
  StaffOrderStickySummary,
  scrollToStaffAnchor,
} from "@/components/staff/StaffOrderSummary";
import {
  emptyStaffOrderDiscountState,
  staffOrderDiscountPayload,
  StaffOrderDiscountSection,
  validateStaffOrderDiscountClient,
  type StaffOrderDiscountState,
} from "@/components/staff/StaffOrderDiscountSection";
import { computeOrderGrandTotal } from "@/lib/order-discount";
import { MenuOptionGroupPicker } from "@/components/customer/MenuOptionGroupPicker";
import { formatPrice } from "@/lib/constants";
import type { MenuItemData } from "@/lib/customer-types";
import {
  fulfillmentToChannel,
  isChannelSellEnabled,
  resolveSellPrice,
} from "@/lib/menu-pricing";
import {
  isMenuItemSoldOut,
  isPromoSellableOnShop,
  listActivePromoMenuItems,
  listVisiblePromoMenuItems,
  orderOptionGroupsForStaffPromo,
  promoScheduleStatusOf,
  type StaffDeliveryLocation,
} from "@/lib/staff-key-order";
import { PROMO_SCHEDULE_STATUS_LABEL, PROMO_SCHEDULE_STATUS_TONE } from "@/lib/promo-schedule";
import { StatusBadge } from "@/components/StatusBadge";
import { readStaffOrderMode } from "@/lib/staff-order-mode";
import {
  computeSelectedOptions,
  filterVisibleOptionGroups,
  pruneHiddenGroupSelections,
  validateOptionGroupSelections,
  type SelectedByGroup,
} from "@/lib/option-selection";
import {
  autoPrintQueueTickets,
  clampTicketCopies,
  formatTicketDateLabel,
} from "@/lib/print-bridge";

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
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    queueNumber: number | null;
    orderNumber: string | null;
    itemCount: number;
    totalAmount: number;
  } | null>(null);
  const [branchName, setBranchName] = useState("");
  const [item, setItem] = useState<MenuItemData | null>(null);
  const [promoCount, setPromoCount] = useState(0);
  const [deliveryLocations, setDeliveryLocations] = useState<
    StaffDeliveryLocation[]
  >([]);
  const [consumables, setConsumables] = useState<StaffConsumableItem[]>([]);
  const [qtyByConsumableId, setQtyByConsumableId] = useState<
    Record<string, number>
  >({});
  const [quantity, setQuantity] = useState(1);
  const [selectedByGroup, setSelectedByGroup] = useState<SelectedByGroup>({});
  const [optionErrorGroupId, setOptionErrorGroupId] = useState<string | null>(
    null,
  );
  const [fulfillment, setFulfillment] = useState<StaffFulfillmentState>(
    emptyStaffFulfillment,
  );
  const [orderDiscount, setOrderDiscount] = useState<StaffOrderDiscountState>(
    emptyStaffOrderDiscountState,
  );
  const [showStickySummary, setShowStickySummary] = useState(true);

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
      const sellable = listActivePromoMenuItems(items);
      const visible = listVisiblePromoMenuItems(items);
      const found =
        visible.find((m) => m.id === itemId) ??
        sellable.find((m) => m.id === itemId) ??
        null;
      setBranchName(data.branchName ?? "");
      setPromoCount(sellable.length);
      setItem(found);
      setDeliveryLocations(
        Array.isArray(data.deliveryLocations) ? data.deliveryLocations : [],
      );
      setConsumables(
        Array.isArray(data.consumables) ? data.consumables : [],
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

  const visibleGroups = useMemo(
    () => filterVisibleOptionGroups(orderedGroups, selectedByGroup),
    [orderedGroups, selectedByGroup],
  );

  const canSell = useMemo(() => {
    if (!item) return false;
    if (!isPromoSellableOnShop(item)) return false;
    return isChannelSellEnabled(item, channel) && !isMenuItemSoldOut(item);
  }, [item, channel]);

  const unitPrice = item ? resolveSellPrice(item, channel).final : 0;

  const selectedOpts = useMemo(
    () =>
      computeSelectedOptions(item?.optionGroups ?? [], selectedByGroup),
    [item, selectedByGroup],
  );

  const deliveryFee = useMemo(() => {
    if (fulfillment.fulfillmentType !== "DELIVERY") return 0;
    const loc = deliveryLocations.find(
      (l) => l.id === fulfillment.deliveryLocationId,
    );
    return loc ? Number(loc.deliveryFee) : 0;
  }, [
    fulfillment.fulfillmentType,
    fulfillment.deliveryLocationId,
    deliveryLocations,
  ]);

  const summaryLines = useMemo(() => {
    if (!item) return [];
    return [
      {
        id: item.id,
        name: item.name,
        quantity,
        unitPrice,
        optionsPrice: selectedOpts.optionsPrice,
        optionNote:
          selectedOpts.optionNames.length > 0
            ? selectedOpts.optionNames.join(" · ")
            : undefined,
      },
    ];
  }, [item, quantity, unitPrice, selectedOpts]);

  const itemsSubtotal = useMemo(
    () =>
      summaryLines.reduce(
        (sum, line) =>
          sum + (line.unitPrice + line.optionsPrice) * line.quantity,
        0,
      ),
    [summaryLines],
  );

  const orderTotal = useMemo(
    () =>
      computeOrderGrandTotal({
        itemsSubtotal,
        deliveryFee,
        discountAmount: orderDiscount.discountAmount,
      }),
    [itemsSubtotal, deliveryFee, orderDiscount.discountAmount],
  );

  useEffect(() => {
    const summary = document.getElementById("staff-order-summary");
    if (!summary) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickySummary(!entry.isIntersecting);
      },
      { rootMargin: "0px 0px -96px 0px", threshold: 0.05 },
    );
    observer.observe(summary);
    return () => observer.disconnect();
  }, [summaryLines.length, deliveryFee]);

  function clearValidation() {
    setError("");
    setAlertMessage(null);
    setOptionErrorGroupId(null);
  }

  function fail(message: string, anchorId?: string, groupId?: string | null) {
    setError(message);
    setAlertMessage(message);
    setOptionErrorGroupId(groupId ?? null);
    if (anchorId) {
      window.setTimeout(() => scrollToStaffAnchor(anchorId), 50);
    }
  }

  async function submit() {
    if (!item) return;
    clearValidation();

    if (!canSell) {
      fail(
        !isPromoSellableOnShop(item)
          ? "โปรนี้หมดอายุแล้ว ขายไม่ได้"
          : "เมนูนี้ไม่พร้อมขายในช่องทางที่เลือก",
        "staff-promo-item",
      );
      return;
    }

    const result = validateOptionGroupSelections(
      item.optionGroups ?? [],
      selectedByGroup,
    );
    if (result) {
      fail(result.error, `staff-opt-group-${result.groupId}`, result.groupId);
      return;
    }

    const fulfillErr = validateStaffFulfillment(fulfillment, deliveryLocations);
    if (fulfillErr) {
      fail(fulfillErr, "staff-fulfillment");
      return;
    }

    if (
      fulfillment.salesChannel === "STOREFRONT" &&
      requiresConsumableSelection(consumables) &&
      selectedConsumableTotal(consumables, qtyByConsumableId) < 1
    ) {
      fail("กรุณาเลือกสินค้าสิ้นเปลืองอย่างน้อย 1 รายการ", "staff-consumables");
      return;
    }

    const discountErr = validateStaffOrderDiscountClient(
      itemsSubtotal,
      deliveryFee,
      orderDiscount,
    );
    if (discountErr) {
      fail(discountErr, "staff-order-discount");
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
        salesChannel: fulfillment.salesChannel,
        note: fulfillment.note.trim() || undefined,
        items: [
          {
            branchMenuItemId: item.id,
            quantity,
            optionIds,
          },
        ],
        completeImmediately: readStaffOrderMode() === "instant",
        consumables: Object.entries(qtyByConsumableId)
          .filter(([, q]) => q > 0)
          .map(([branchNonMenuItemId, quantity]) => ({
            branchNonMenuItemId,
            quantity,
          })),
        ...staffOrderDiscountPayload(orderDiscount),
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
      if (res.status === 401) {
        fail("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        router.replace("/staff/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const unavailable = Array.isArray(data.unavailableItems)
          ? (data.unavailableItems as Array<{ name?: string; reason?: string }>)
          : [];
        const detail =
          unavailable.length > 0
            ? unavailable
                .map((u) => `${u.name ?? "รายการ"}: ${u.reason ?? ""}`)
                .join(" · ")
            : null;
        const message = detail || data.error || "บันทึกไม่สำเร็จ";
        fail(message);
        return;
      }

      const queueNumber =
        typeof data.queueNumber === "number" ? data.queueNumber : null;
      const orderNumber =
        typeof data.orderNumber === "string" ? data.orderNumber : null;
      const totalAmount =
        typeof data.totalAmount === "number" ? data.totalAmount : orderTotal;

      autoPrintQueueTickets({
        queueNumber,
        orderNumber,
        dateLabel:
          formatTicketDateLabel(
            typeof data.operatingDay === "string"
              ? data.operatingDay
              : typeof data.queueBusinessDate === "string"
                ? data.queueBusinessDate
                : null,
          ) || formatTicketDateLabel(new Date().toISOString()),
        copies: clampTicketCopies(
          typeof data.queueTicketCopies === "number"
            ? data.queueTicketCopies
            : 1,
        ),
        staffName:
          typeof data.customerName === "string" ? data.customerName : null,
        orderType:
          data.fulfillmentType === "STOREFRONT"
            ? "ทานที่ร้าน"
            : data.fulfillmentType === "PICKUP"
              ? "รับกลับบ้าน"
              : data.fulfillmentType === "DELIVERY"
                ? "เดลิเวอรี"
                : null,
        items: Array.isArray(data.items)
          ? data.items.map((it: {
              itemName?: string;
              optionsText?: string | null;
              quantity: number;
              unitPrice: unknown;
              optionsPrice: unknown;
            }) => ({
              name: it.itemName ?? "",
              optionsText: it.optionsText || "",
              qty: it.quantity,
              price: Number(it.unitPrice) + Number(it.optionsPrice),
              total:
                (Number(it.unitPrice) + Number(it.optionsPrice)) * it.quantity,
            }))
          : null,
        subtotal: totalAmount,
        discount: 0,
        paymentMethod:
          data.paymentMethod === "CASH"
            ? "เงินสด"
            : data.paymentMethod === "PROMPTPAY"
              ? "โอนเงิน (QR)"
              : data.paymentMethod,
        totalAmount,
        brandName: data.brandName ?? "",
        branchName: data.branchName ?? "",
        branchAddress: data.branchAddress ?? "",
      });

      const skewerCount = (item.optionGroups ?? [])
        .filter((g) => g.mode === "FROM_MENU")
        .reduce((sum, g) => sum + (selectedByGroup[g.id]?.length ?? 0), 0);
      const pieceCount =
        skewerCount > 0 ? skewerCount * quantity : quantity;

      setSuccessInfo({
        queueNumber,
        orderNumber,
        itemCount: pieceCount,
        totalAmount,
      });
    } catch {
      fail("บันทึกไม่สำเร็จ กรุณาลองใหม่");
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
          disabled={submitting || !canSell}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {submitting
            ? "กำลังบันทึก…"
            : !canSell
              ? PROMO_SCHEDULE_STATUS_LABEL[promoScheduleStatusOf(item)]
              : `บันทึกออเดอร์ · ${formatPrice(orderTotal)}฿`}
        </button>
      }
    >
      {!isPromoSellableOnShop(item) ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <StatusBadge
            label={PROMO_SCHEDULE_STATUS_LABEL[promoScheduleStatusOf(item)]}
            tone={PROMO_SCHEDULE_STATUS_TONE[promoScheduleStatusOf(item)]}
            size="md"
          />
          <p className="mt-2 text-[13px] font-medium text-amber-800/90">
            โปรนี้หมดอายุแล้ว คีย์ขายไม่ได้ · แก้วันหมดอายุได้ที่จัดการโปร
          </p>
          <Link
            href="/staff/settings/promos"
            className="mt-2 inline-flex text-[13px] font-bold text-amber-900 underline"
          >
            ไปจัดการวันหมดอายุ
          </Link>
        </div>
      ) : null}
      {showStickySummary ? (
        <div
          className="fixed inset-x-0 z-20 px-4"
          style={{ bottom: STAFF_KEY_ORDER_STICKY_OFFSET }}
        >
          <div className="mx-auto max-w-lg">
            <StaffOrderStickySummary
              lineCount={summaryLines.length}
              pieceCount={quantity}
              totalAmount={orderTotal}
              onClick={() => scrollToStaffAnchor("staff-order-summary")}
            />
          </div>
        </div>
      ) : null}

      {promoCount > 1 ? (
        <Link
          href="/staff/key-order/promo"
          className="inline-flex text-xs font-semibold text-site-primary underline"
        >
          เปลี่ยนโปรโมชั่น
        </Link>
      ) : null}

      <section
        id="staff-promo-item"
        tabIndex={-1}
        className="rounded-2xl border border-gray-200 bg-white p-4 outline-none"
      >
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
                onClick={() => {
                  clearValidation();
                  setQuantity((q) => Math.max(1, q - 1));
                }}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-xl font-bold disabled:opacity-40"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-bold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => {
                  clearValidation();
                  setQuantity((q) => Math.min(20, q + 1));
                }}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-site-primary text-xl font-bold text-white"
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
          รายการในตัวเลือกเรียงตามพยัญชนะไทย · กรอกแล้วบันทึกในหน้านี้
        </p>
        {visibleGroups.map((group) => {
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
                  {group.required || (group.minSelect ?? 0) > 0 ? (
                    <span className="ml-1 text-xs font-medium text-red-500">
                      *จำเป็น
                    </span>
                  ) : null}
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
                onChange={(ids) => {
                  clearValidation();
                  setSelectedByGroup((prev) =>
                    pruneHiddenGroupSelections(orderedGroups, {
                      ...prev,
                      [group.id]: ids,
                    }),
                  );
                }}
              />
            </section>
          );
        })}
      </div>

      <StaffConsumablePicker
        items={consumables}
        qtyByItemId={qtyByConsumableId}
        onChangeQty={(itemId, next) => {
          clearValidation();
          setQtyByConsumableId((prev) => {
            const q = Math.max(0, Math.min(99, Math.floor(next)));
            const nextMap = { ...prev };
            if (q <= 0) delete nextMap[itemId];
            else nextMap[itemId] = q;
            return nextMap;
          });
        }}
      />

      <StaffQuickFulfillment
        value={fulfillment}
        onChange={(next) => {
          clearValidation();
          setFulfillment(next);
        }}
        deliveryLocations={deliveryLocations}
      />

      <StaffOrderDiscountSection
        itemsSubtotal={itemsSubtotal}
        deliveryFee={deliveryFee}
        value={orderDiscount}
        onChange={(next) => {
          clearValidation();
          setOrderDiscount(next);
        }}
        disabled={submitting}
      />

      <StaffOrderSummary
        lines={summaryLines}
        deliveryFee={deliveryFee}
        discountAmount={orderDiscount.discountAmount}
      />

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <StaffKeyOrderAlertModal
        open={Boolean(alertMessage)}
        message={alertMessage ?? ""}
        onClose={() => setAlertMessage(null)}
      />

      <StaffKeyOrderSuccessModal
        open={Boolean(successInfo)}
        queueNumber={successInfo?.queueNumber ?? null}
        orderNumber={successInfo?.orderNumber ?? null}
        itemCount={successInfo?.itemCount ?? 0}
        totalAmount={successInfo?.totalAmount ?? 0}
        onBack={() => {
          window.location.href = "/staff";
        }}
      />
    </StaffKeyOrderLayout>
  );
}

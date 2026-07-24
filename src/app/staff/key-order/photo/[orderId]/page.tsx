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
import {
  StaffKeyOrderAlertModal,
  StaffOrderSummary,
  StaffOrderStickySummary,
  scrollToStaffAnchor,
  type StaffOrderSummaryLine,
} from "@/components/staff/StaffOrderSummary";
import { MenuOptionGroupPicker } from "@/components/customer/MenuOptionGroupPicker";
import { IconSkewerPlaceholder } from "@/components/icons";
import { formatPrice } from "@/lib/constants";
import { formatQueueNumber } from "@/lib/order-queue-format";
import type { MenuItemData } from "@/lib/customer-types";
import {
  isChannelSellEnabled,
  resolveSellPrice,
  fulfillmentToChannel,
} from "@/lib/menu-pricing";
import {
  collectSharedOptionGroups,
  isRegularMenuItem,
  optionIdsForMenuItem,
  type StaffDeliveryLocation,
} from "@/lib/staff-key-order";
import {
  computeSelectedOptions,
  validateOptionGroupSelections,
  type SelectedByGroup,
} from "@/lib/option-selection";
import { compareThaiText, sortByThaiName } from "@/lib/thai-sort";
import { saveStaffOrderFeedback } from "@/lib/staff-order-feedback";

type MenuPayload = {
  branchName?: string;
  menuItems: MenuItemData[];
  deliveryLocations: StaffDeliveryLocation[];
};

export default function StaffPhotoKeyOrderPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const {
    state: roundState,
    loading: roundLoading,
    blocked,
  } = useStaffRoundGate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItemData[]>([]);
  const [deliveryLocations, setDeliveryLocations] = useState<
    StaffDeliveryLocation[]
  >([]);
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedByGroup, setSelectedByGroup] = useState<SelectedByGroup>({});
  const [optionErrorGroupId, setOptionErrorGroupId] = useState<string | null>(
    null,
  );
  const [fulfillment, setFulfillment] = useState<StaffFulfillmentState>(
    emptyStaffFulfillment,
  );
  const [showStickySummary, setShowStickySummary] = useState(true);

  useEffect(() => {
    if (blocked || roundLoading || !roundState || !orderId) return;
    let cancelled = false;
    (async () => {
      const [orderRes, menuRes] = await Promise.all([
        fetch(`/api/staff/orders/${orderId}/fill`),
        fetch("/api/staff/menu?channel=storefront"),
      ]);
      if (orderRes.status === 401 || menuRes.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const orderData = await orderRes.json().catch(() => ({}));
      const menuData = (await menuRes.json().catch(() => ({}))) as MenuPayload;
      if (cancelled) return;
      if (!orderRes.ok) {
        setError(orderData.error ?? "ไม่พบออเดอร์");
        setLoading(false);
        return;
      }
      if (!orderData.awaitingPhotoKey) {
        saveStaffOrderFeedback({
          kind: "error",
          message: "ออเดอร์นี้คีย์รายการครบแล้ว",
        });
        router.replace("/staff");
        return;
      }
      setQueueNumber(
        typeof orderData.queueNumber === "number" ? orderData.queueNumber : null,
      );
      setPhotoUrl(
        typeof orderData.photoUrl === "string" ? orderData.photoUrl : null,
      );
      setBranchName(menuData.branchName ?? "");
      setMenuItems(Array.isArray(menuData.menuItems) ? menuData.menuItems : []);
      setDeliveryLocations(
        Array.isArray(menuData.deliveryLocations)
          ? menuData.deliveryLocations
          : [],
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, blocked, roundLoading, roundState, orderId]);

  const channel = fulfillmentToChannel(fulfillment.fulfillmentType);

  const regularItems = useMemo(() => {
    return sortByThaiName(
      menuItems
        .filter(isRegularMenuItem)
        .filter((item) => isChannelSellEnabled(item, channel)),
    );
  }, [menuItems, channel]);

  const categories = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; sortOrder: number }
    >();
    for (const item of regularItems) {
      const id = item.category?.id ?? "__other__";
      const name = item.category?.name ?? "อื่นๆ";
      const sortOrder = item.category?.sortOrder ?? 999;
      if (!map.has(id)) map.set(id, { id, name, sortOrder });
    }
    return [...map.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || compareThaiText(a.name, b.name),
    );
  }, [regularItems]);

  const visibleItems = useMemo(() => {
    const list =
      categoryFilter === "ALL"
        ? regularItems
        : regularItems.filter(
            (item) => (item.category?.id ?? "__other__") === categoryFilter,
          );
    return sortByThaiName(list);
  }, [regularItems, categoryFilter]);

  const sharedGroups = useMemo(
    () => collectSharedOptionGroups(regularItems, qtyByItemId),
    [regularItems, qtyByItemId],
  );

  const selectedCount = useMemo(
    () =>
      Object.values(qtyByItemId).reduce(
        (n, q) => n + Math.max(0, Math.floor(q)),
        0,
      ),
    [qtyByItemId],
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

  const summaryLines: StaffOrderSummaryLine[] = useMemo(() => {
    return regularItems
      .filter((item) => (qtyByItemId[item.id] ?? 0) > 0)
      .map((item) => {
        const groups = (item.optionGroups ?? []).filter(
          (g) => g.mode !== "FROM_MENU",
        );
        const opts = computeSelectedOptions(groups, selectedByGroup);
        return {
          id: item.id,
          name: item.name,
          quantity: qtyByItemId[item.id]!,
          unitPrice: resolveSellPrice(item, channel).final,
          optionsPrice: opts.optionsPrice,
          optionNote:
            opts.optionNames.length > 0
              ? opts.optionNames.join(" · ")
              : undefined,
        };
      });
  }, [regularItems, qtyByItemId, selectedByGroup, channel]);

  const orderTotal = useMemo(() => {
    const items = summaryLines.reduce(
      (sum, line) =>
        sum + (line.unitPrice + line.optionsPrice) * line.quantity,
      0,
    );
    return items + deliveryFee;
  }, [summaryLines, deliveryFee]);
  const selectedLineCount = summaryLines.length;

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
  }, [selectedLineCount, deliveryFee]);

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

  function setQty(itemId: string, next: number) {
    clearValidation();
    setQtyByItemId((prev) => {
      const q = Math.max(0, Math.min(99, Math.floor(next)));
      if (q <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: q };
    });
  }

  async function submit() {
    clearValidation();
    const lines = regularItems.filter(
      (item) => (qtyByItemId[item.id] ?? 0) > 0 && !item.isOutOfStock,
    );
    if (lines.length === 0) {
      fail("กรุณาเลือกอย่างน้อย 1 เมนู", "staff-menu-section");
      return;
    }
    for (const item of lines) {
      const groups = (item.optionGroups ?? []).filter(
        (g) => g.mode !== "FROM_MENU",
      );
      const result = validateOptionGroupSelections(groups, selectedByGroup);
      if (result) {
        fail(result.error, `staff-opt-group-${result.groupId}`, result.groupId);
        return;
      }
    }
    const fulfillErr = validateStaffFulfillment(fulfillment, deliveryLocations);
    if (fulfillErr) {
      fail(fulfillErr, "staff-fulfillment");
      return;
    }

    setSubmitting(true);
    try {
      const items = lines.map((item) => ({
        branchMenuItemId: item.id,
        quantity: qtyByItemId[item.id]!,
        optionIds: optionIdsForMenuItem(item, selectedByGroup),
      }));
      const body: Record<string, unknown> = {
        fulfillmentType: fulfillment.fulfillmentType,
        paymentMethod: fulfillment.paymentMethod,
        salesChannel: fulfillment.salesChannel,
        note: fulfillment.note.trim() || undefined,
        items,
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

      const res = await fetch(`/api/staff/orders/${orderId}/fill`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        saveStaffOrderFeedback({
          kind: "error",
          message: data.error ?? "บันทึกไม่สำเร็จ",
        });
        fail(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      saveStaffOrderFeedback({
        kind: "success",
        message: "คีย์รายการจากรูปแล้ว",
        orderId,
        queueNumber:
          typeof data.queueNumber === "number" ? data.queueNumber : queueNumber,
        orderNumber:
          typeof data.orderNumber === "string" ? data.orderNumber : null,
        printTickets: false,
        totalAmount:
          typeof data.totalAmount === "number" ? data.totalAmount : orderTotal,
      });
      router.replace("/staff");
    } catch {
      fail("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  if (blocked || roundLoading || !roundState || loading) {
    return <StaffRoundGateLoading label="กำลังโหลดออเดอร์จากรูป" />;
  }

  return (
    <StaffKeyOrderLayout
      title={
        queueNumber != null
          ? `คีย์จากรูป · คิว ${formatQueueNumber(queueNumber)}`
          : "คีย์จากรูป"
      }
      subtitle={branchName || undefined}
      footer={
        <button
          type="button"
          disabled={submitting || selectedCount === 0}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-orange-500 px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {submitting
            ? "กำลังบันทึก…"
            : `บันทึกรายการ · ${formatPrice(orderTotal)}฿`}
        </button>
      }
    >
      {selectedLineCount > 0 && showStickySummary ? (
        <div className="fixed inset-x-0 bottom-[4.8rem] z-20 px-4">
          <div className="mx-auto max-w-lg">
            <StaffOrderStickySummary
              lineCount={selectedLineCount}
              pieceCount={selectedCount}
              totalAmount={orderTotal}
              onClick={() => scrollToStaffAnchor("staff-order-summary")}
            />
          </div>
        </div>
      ) : null}

      <StaffRoundStatusStrip state={roundState} />
      <StaffKeyOrderAlertModal
        open={Boolean(alertMessage)}
        message={alertMessage ?? ""}
        onClose={() => setAlertMessage(null)}
      />

      {photoUrl ? (
        <div className="mb-3 overflow-hidden rounded-xl ring-1 ring-orange-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt="รูปออเดอร์"
            className="max-h-56 w-full object-contain bg-black"
          />
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div id="staff-fulfillment" className="mb-4">
        <StaffQuickFulfillment
          value={fulfillment}
          onChange={(next) => {
            clearValidation();
            setFulfillment(next);
          }}
          deliveryLocations={deliveryLocations}
        />
      </div>

      {sharedGroups.length > 0 ? (
        <div className="mb-4 space-y-3">
          {sharedGroups.map((group) => (
            <div
              key={group.id}
              id={`staff-opt-group-${group.id}`}
              className="min-w-0 rounded-xl border border-gray-200 bg-white p-3"
            >
              <p className="mb-1 text-sm font-semibold text-gray-900">
                {group.name}
              </p>
              <MenuOptionGroupPicker
                group={group}
                compact
                selectedIds={selectedByGroup[group.id] ?? []}
                highlightError={optionErrorGroupId === group.id}
                onChange={(ids) => {
                  clearValidation();
                  setSelectedByGroup((prev) => ({
                    ...prev,
                    [group.id]: ids,
                  }));
                }}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div id="staff-menu-section" className="mb-3">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter("ALL")}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              categoryFilter === "ALL"
                ? "bg-site-primary text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            ทั้งหมด
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                categoryFilter === c.id
                  ? "bg-site-primary text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {visibleItems.map((item, index) => {
            const qty = qtyByItemId[item.id] ?? 0;
            const price = resolveSellPrice(item, channel).final;
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2"
              >
                <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                  {index + 1}
                </span>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <IconSkewerPlaceholder className="h-full w-full p-2 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatPrice(price)}฿
                    {item.isOutOfStock ? " · หมด" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={item.isOutOfStock || qty <= 0}
                    onClick={() => setQty(item.id, qty - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{qty}</span>
                  <button
                    type="button"
                    disabled={item.isOutOfStock}
                    onClick={() => setQty(item.id, qty + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-site-primary text-lg font-bold text-white disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div id="staff-order-summary">
        <StaffOrderSummary lines={summaryLines} deliveryFee={deliveryFee} />
      </div>

      <p className="mt-4 text-center text-xs text-gray-500">
        <Link href="/staff" className="underline">
          กลับหน้ารายการ
        </Link>
      </p>
    </StaffKeyOrderLayout>
  );
}

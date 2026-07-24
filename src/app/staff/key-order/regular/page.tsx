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

export default function StaffRegularKeyOrderPage() {
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
  const [branchName, setBranchName] = useState("");
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
    if (blocked || roundLoading || !roundState) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/staff/menu?channel=storefront");
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as MenuPayload;
      if (cancelled) return;
      setBranchName(data.branchName ?? "");
      setMenuItems(Array.isArray(data.menuItems) ? data.menuItems : []);
      setDeliveryLocations(
        Array.isArray(data.deliveryLocations) ? data.deliveryLocations : [],
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, blocked, roundLoading, roundState]);

  const channel = fulfillmentToChannel(fulfillment.fulfillmentType);

  const regularItems = useMemo(() => {
    return sortByThaiName(
      menuItems
        .filter(isRegularMenuItem)
        .filter((item) => isChannelSellEnabled(item, channel)),
    );
  }, [menuItems, channel]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sortOrder: number }>();
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
  const selectedPieceCount = selectedCount;

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

      const res = await fetch("/api/staff/orders", {
        method: "POST",
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
        message: "บันทึกออเดอร์แล้ว",
        orderId: typeof data.id === "string" ? data.id : undefined,
        queueNumber:
          typeof data.queueNumber === "number" ? data.queueNumber : null,
        orderNumber:
          typeof data.orderNumber === "string" ? data.orderNumber : null,
        dateLabel:
          typeof data.operatingDay === "string"
            ? data.operatingDay
            : typeof data.queueBusinessDate === "string"
              ? data.queueBusinessDate
              : null,
        queueTicketCopies:
          typeof data.queueTicketCopies === "number"
            ? data.queueTicketCopies
            : null,
        printTickets: true,
        totalAmount:
          typeof data.totalAmount === "number" ? data.totalAmount : orderTotal,
      });
      router.replace("/staff");
    } catch {
      saveStaffOrderFeedback({
        kind: "error",
        message: "บันทึกไม่สำเร็จ กรุณาลองใหม่",
      });
      fail("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  if (blocked || roundLoading || !roundState || loading) {
    return <StaffRoundGateLoading label="กำลังโหลดเมนู" />;
  }

  return (
    <StaffKeyOrderLayout
      title="คีย์ออเดอร์แบบธรรมดา"
      subtitle={branchName || undefined}
      footer={
        <button
          type="button"
          disabled={submitting || selectedCount === 0}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {submitting
            ? "กำลังบันทึก…"
            : `บันทึกออเดอร์ · ${formatPrice(orderTotal)}฿`}
        </button>
      }
    >
      {selectedLineCount > 0 && showStickySummary ? (
        <div className="fixed inset-x-0 bottom-[4.8rem] z-20 px-4">
          <div className="mx-auto max-w-lg">
            <StaffOrderStickySummary
              lineCount={selectedLineCount}
              pieceCount={selectedPieceCount}
              totalAmount={orderTotal}
              onClick={() => scrollToStaffAnchor("staff-order-summary")}
            />
          </div>
        </div>
      ) : null}

      <StaffRoundStatusStrip state={roundState} />

      <section
        id="staff-menu-section"
        tabIndex={-1}
        className="rounded-2xl border border-gray-200 bg-white p-4 outline-none"
      >
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">เลือกเมนู</h2>
            <p className="text-xs text-gray-500">
              เรียงตามพยัญชนะไทย · กด + เพิ่มหลายเมนูในหน้าเดียว
            </p>
          </div>
          <Link
            href="/staff/key-order/promo"
            className="text-xs font-semibold text-site-primary underline"
          >
            ไปแบบโปร
          </Link>
        </div>

        {regularItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
            ไม่มีเมนูธรรมดาที่ขายในช่องทางนี้
          </p>
        ) : (
          <>
            {categories.length > 1 ? (
              <div className="mb-3 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max min-w-full gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("ALL")}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                      categoryFilter === "ALL"
                        ? "bg-site-primary text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                        categoryFilter === cat.id
                          ? "bg-site-primary text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {visibleItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                ไม่มีเมนูในหมวดนี้
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visibleItems.map((item, index) => {
                  const qty = qtyByItemId[item.id] ?? 0;
                  const price = resolveSellPrice(item, channel).final;
                  const soldOut = item.isOutOfStock;
                  return (
                    <li
                      key={item.id}
                      className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0 ${
                        soldOut ? "opacity-50" : ""
                      }`}
                    >
                      <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                        {index + 1}
                      </span>
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <IconSkewerPlaceholder size={28} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium leading-snug text-gray-900">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {soldOut
                            ? "หมดชั่วคราว"
                            : `${item.category?.name ? `${item.category.name} · ` : ""}${formatPrice(price)}฿`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="ลด"
                          disabled={qty <= 0 || soldOut}
                          onClick={() => setQty(item.id, qty - 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-700 disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label="เพิ่ม"
                          disabled={soldOut}
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
            )}
          </>
        )}
      </section>

      {sharedGroups.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              ตัวเลือกร่วม
            </h2>
            <p className="text-xs text-gray-600">
              เลือกครั้งเดียว ใช้กับทุกเมนูที่เลือกไว้ซึ่งมีหัวข้อเดียวกัน
            </p>
          </div>
          {sharedGroups.map((group) => (
            <div
              key={group.id}
              className="min-w-0 rounded-xl border border-white bg-white p-3"
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
        </section>
      ) : null}

      <StaffQuickFulfillment
        value={fulfillment}
        onChange={(next) => {
          clearValidation();
          setFulfillment(next);
        }}
        deliveryLocations={deliveryLocations}
      />

      <StaffOrderSummary lines={summaryLines} deliveryFee={deliveryFee} />

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
    </StaffKeyOrderLayout>
  );
}

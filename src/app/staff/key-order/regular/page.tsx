"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  type StaffOrderSummaryLine,
} from "@/components/staff/StaffOrderSummary";
import { MenuOptionGroupPicker } from "@/components/customer/MenuOptionGroupPicker";
import { IconSkewerPlaceholder } from "@/components/icons";
import { formatPrice, formatPriceLabel } from "@/lib/constants";
import type { MenuItemData } from "@/lib/customer-types";
import {
  isChannelSellEnabled,
  resolveSellPrice,
  fulfillmentToChannel,
} from "@/lib/menu-pricing";
import {
  collectSharedOptionGroups,
  isMenuItemSoldOut,
  isRegularMenuItem,
  optionIdsForMenuItem,
  stockQuantityCap,
  type StaffDeliveryLocation,
} from "@/lib/staff-key-order";
import { readStaffOrderMode } from "@/lib/staff-order-mode";
import {
  computeSelectedOptions,
  effectiveMinSelect,
  filterVisibleOptionGroups,
  pruneHiddenGroupSelections,
  validateOptionGroupSelections,
  type SelectedByGroup,
} from "@/lib/option-selection";
import { compareThaiText } from "@/lib/thai-sort";
import {
  assignStableMenuSequence,
  sortMenuItemData,
} from "@/lib/staff-menu-order";
import {
  autoPrintQueueTickets,
  clampTicketCopies,
  formatTicketDateLabel,
} from "@/lib/print-bridge";

type MenuPayload = {
  branchName?: string;
  menuItems: MenuItemData[];
  consumables?: StaffConsumableItem[];
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
  const [alertTitle, setAlertTitle] = useState("กรอกข้อมูลไม่ครบ");
  const [successInfo, setSuccessInfo] = useState<{
    queueNumber: number | null;
    orderNumber: string | null;
    itemCount: number;
    totalAmount: number;
  } | null>(null);
  const [branchName, setBranchName] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItemData[]>([]);
  const [consumables, setConsumables] = useState<StaffConsumableItem[]>([]);
  const [qtyByConsumableId, setQtyByConsumableId] = useState<
    Record<string, number>
  >({});
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
      setConsumables(Array.isArray(data.consumables) ? data.consumables : []);
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
    return sortMenuItemData(
      menuItems
        .filter(isRegularMenuItem)
        .filter((item) => isChannelSellEnabled(item, channel)),
    );
  }, [menuItems, channel]);

  const seqById = useMemo(
    () => assignStableMenuSequence(regularItems),
    [regularItems],
  );

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
    if (categoryFilter === "ALL") return regularItems;
    return regularItems.filter(
      (item) => (item.category?.id ?? "__other__") === categoryFilter,
    );
  }, [regularItems, categoryFilter]);

  const sharedGroups = useMemo(
    () =>
      collectSharedOptionGroups(regularItems, qtyByItemId, {
        onlySelected: true,
      }),
    [regularItems, qtyByItemId],
  );

  const visibleSharedGroups = useMemo(
    () => filterVisibleOptionGroups(sharedGroups, selectedByGroup),
    [sharedGroups, selectedByGroup],
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
    setAlertTitle("กรอกข้อมูลไม่ครบ");
    setOptionErrorGroupId(null);
  }

  function fail(
    message: string,
    anchorId?: string,
    groupId?: string | null,
    title?: string,
  ) {
    setError(message);
    setAlertTitle(title ?? "กรอกข้อมูลไม่ครบ");
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

  function setConsumableQty(itemId: string, next: number) {
    clearValidation();
    setQtyByConsumableId((prev) => {
      const q = Math.max(0, Math.min(99, Math.floor(next)));
      const nextMap = { ...prev };
      if (q <= 0) delete nextMap[itemId];
      else nextMap[itemId] = q;
      return nextMap;
    });
  }

  async function submit() {
    clearValidation();

    const lines = regularItems.filter(
      (item) => (qtyByItemId[item.id] ?? 0) > 0 && !isMenuItemSoldOut(item),
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

    if (
      fulfillment.salesChannel === "STOREFRONT" &&
      requiresConsumableSelection(consumables) &&
      selectedConsumableTotal(consumables, qtyByConsumableId) < 1
    ) {
      fail("กรุณาเลือกสินค้าสิ้นเปลืองอย่างน้อย 1 รายการ", "staff-consumables");
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
        completeImmediately: readStaffOrderMode() === "instant",
        consumables: Object.entries(qtyByConsumableId)
          .filter(([, q]) => q > 0)
          .map(([branchNonMenuItemId, quantity]) => ({
            branchNonMenuItemId,
            quantity,
          })),
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
        fail(
          "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
          undefined,
          null,
          "ต้องเข้าสู่ระบบใหม่",
        );
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
        fail(
          message,
          undefined,
          null,
          res.status === 403 ? "ไม่สามารถบันทึกได้" : "บันทึกไม่สำเร็จ",
        );
        return;
      }

      const queueNumber =
        typeof data.queueNumber === "number" ? data.queueNumber : null;
      const orderNumber =
        typeof data.orderNumber === "string" ? data.orderNumber : null;
      const totalAmount =
        typeof data.totalAmount === "number" ? data.totalAmount : orderTotal;
      const itemCount = selectedCount;

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
        discount: Number(data.discountAmount) || 0,
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

      setSuccessInfo({ queueNumber, orderNumber, itemCount, totalAmount });
    } catch {
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
        <div
          className="fixed inset-x-0 z-20 px-4"
          style={{ bottom: STAFF_KEY_ORDER_STICKY_OFFSET }}
        >
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
                {visibleItems.map((item) => {
                  const qty = qtyByItemId[item.id] ?? 0;
                  const price = resolveSellPrice(item, channel).final;
                  const sq = stockQuantityCap(item);
                  const tracked = item.stockQuantity != null;
                  const soldOut = isMenuItemSoldOut(item);
                  const seq = seqById.get(item.id) ?? 0;
                  return (
                    <li
                      key={item.id}
                      className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0 ${
                        soldOut ? "opacity-50" : ""
                      }`}
                    >
                      <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                        {seq}
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
                          {soldOut ? (
                            "หมดชั่วคราว"
                          ) : (
                            <>
                              {item.category?.name ? `${item.category.name} · ` : ""}
                              {formatPriceLabel(price)}
                              {tracked ? (
                                <>
                                  {" · "}
                                  <span className="font-bold text-gray-900">
                                    เหลือ {item.stockQuantity}
                                  </span>
                                </>
                              ) : null}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="ลด"
                          disabled={qty <= 0 || soldOut}
                          onClick={() => setQty(item.id, qty - 1)}
                          className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-xl font-bold text-gray-700 disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label="เพิ่ม"
                          disabled={soldOut || qty >= sq}
                          onClick={() => setQty(item.id, qty + 1)}
                          className="flex h-12 w-12 items-center justify-center rounded-xl bg-site-primary text-xl font-bold text-white disabled:opacity-40"
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

      {visibleSharedGroups.length > 0 ? (
        <section
          id="staff-shared-options"
          tabIndex={-1}
          className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 outline-none"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              ตัวเลือกร่วม
            </h2>
            <p className="text-xs text-gray-600">
              เลือกเมนูก่อน แล้วค่อยเลือกตัวเลือกร่วม · จะติดไปทุกรายการที่รองรับ ·
              น้ำชาบูโผล่เมื่อเลือกชาบู
            </p>
          </div>
          {visibleSharedGroups.map((group) => (
            <div
              key={group.id}
              id={`staff-opt-group-${group.id}`}
              className={`min-w-0 rounded-xl border bg-white p-3 ${
                group.required
                  ? "border-amber-300 ring-1 ring-amber-200"
                  : "border-white"
              } ${
                optionErrorGroupId === group.id
                  ? "border-red-400 ring-2 ring-red-200"
                  : ""
              }`}
            >
              <p className="mb-1 text-sm font-semibold text-gray-900">
                {group.name}
                {group.required || effectiveMinSelect(group) > 0 ? (
                  <span className="ml-1 text-xs font-medium text-red-500">
                    *จำเป็น
                  </span>
                ) : null}
              </p>
              <MenuOptionGroupPicker
                group={group}
                compact
                selectedIds={selectedByGroup[group.id] ?? []}
                highlightError={optionErrorGroupId === group.id}
                onChange={(ids) => {
                  clearValidation();
                  setSelectedByGroup((prev) =>
                    pruneHiddenGroupSelections(sharedGroups, {
                      ...prev,
                      [group.id]: ids,
                    }),
                  );
                }}
              />
            </div>
          ))}
        </section>
      ) : null}

      <StaffConsumablePicker
        items={consumables}
        qtyByItemId={qtyByConsumableId}
        onChangeQty={setConsumableQty}
      />

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
        title={alertTitle}
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

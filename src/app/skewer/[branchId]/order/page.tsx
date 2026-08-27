"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SkewerAuthGate,
  useSkewerBranchMeta,
} from "@/components/skewer/SkewerAppShell";
import { SkewerKeyOrderLayout } from "@/components/skewer/SkewerKeyOrderLayout";
import { SkewerMenuItemQtyDetail } from "@/components/skewer/SkewerMenuItemQtyDetail";
import {
  SkewerMenuViewToggle,
  SKEWER_MENU_VIEW_STORAGE_KEY,
  type SkewerMenuViewMode,
} from "@/components/skewer/SkewerMenuViewToggle";
import { SkewerPhotoMenuGrid } from "@/components/skewer/SkewerPhotoMenuGrid";
import { LoadingState } from "@/components/LoadingState";
import { DateInput } from "@/components/DateInput";
import {
  CustomerDeliveryMapPin,
  type MapLocationValue,
} from "@/components/customer/CustomerDeliveryMapPin";
import {
  StaffKeyOrderAlertModal,
  scrollToStaffAnchor,
} from "@/components/staff/StaffOrderSummary";
import { IconSkewerPlaceholder } from "@/components/icons";
import { bangkokDateKey } from "@/lib/constants";
import {
  SKEWER_MIN_QTY_PER_ITEM,
  SKEWER_CATEGORY_ROLE_LABELS,
  formatSkewerQtyLabel,
  formatSkewerSplitSummary,
  normalizeSkewerOrderQty,
  resolveSkewerCategoryRole,
  resolveSkewerMenuImageUrl,
  resolveSkewerMinQty,
  resolveSkewerQtyUnit,
  resolveSticksPerUnit,
  resolveCountsAsSticks,
  summarizeSkewerSplit,
} from "@/lib/skewer-order";
import { splitLinesBySkewerRole } from "@/components/skewer/SkewerSplitOrderSections";
import {
  assignStableMenuSequence,
  sortMenuItemData,
} from "@/lib/staff-menu-order";
import { isRegularMenuItem } from "@/lib/staff-key-order";
import { compareThaiText } from "@/lib/thai-sort";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  skewerImageUrl?: string | null;
  quantityUnit?: string | null;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  skewerMinQty?: number | null;
  isOutOfStock: boolean;
  sortOrder?: number | null;
  category: {
    id: string;
    name: string;
    sortOrder: number;
    stockExempt?: boolean | null;
    skewerCategoryRole?: string | null;
  } | null;
  optionGroups?: Array<{ mode?: "MANUAL" | "FROM_MENU" }> | null;
};

type PrefillOrder = {
  id: string;
  addressText: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  items: {
    branchMenuItemId: string | null;
    requestedQuantity: number;
    confirmedQuantity: number | null;
  }[];
};

type PageProps = { params: Promise<{ branchId: string }> };

export default function SkewerOrderPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
        </main>
      }
    >
      <SkewerOrderPageInner params={params} />
    </Suspense>
  );
}

function SkewerOrderPageInner({ params }: PageProps) {
  const { branchId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const reorderId = searchParams.get("reorder");
  const meta = useSkewerBranchMeta(branchId);
  const branchName = meta.name;
  const isOpen = meta.isOpen;

  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [branchPin, setBranchPin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [requestedDate, setRequestedDate] = useState(
    reorderId ? "" : bangkokDateKey(),
  );
  const [addressText, setAddressText] = useState("");
  const [mapValue, setMapValue] = useState<MapLocationValue>({
    address: "",
    latitude: null,
    longitude: null,
  });
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertTitle, setAlertTitle] = useState("กรอกข้อมูลไม่ครบ");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [prefillHint, setPrefillHint] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [menuView, setMenuView] = useState<SkewerMenuViewMode>("grid");
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailDraftQty, setDetailDraftQty] = useState(0);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const pendingScrollMenuIdRef = useRef<string | null>(null);
  const prefillsDoneKey = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SKEWER_MENU_VIEW_STORAGE_KEY);
      if (raw === "list" || raw === "grid") setMenuView(raw);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skewer/branch?branchId=${encodeURIComponent(branchId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลดเมนูไม่สำเร็จ");
        if (cancelled) return;
        setMenuItems(Array.isArray(data.menuItems) ? data.menuItems : []);
        if (
          typeof data.latitude === "number" &&
          typeof data.longitude === "number"
        ) {
          setBranchPin({
            latitude: data.latitude,
            longitude: data.longitude,
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  function applyPrefill(order: PrefillOrder, opts: { clearDate: boolean }) {
    const available = new Set(menuItems.map((m) => m.id));
    const nextQtys: Record<string, number> = {};
    for (const item of order.items) {
      if (!item.branchMenuItemId || !available.has(item.branchMenuItemId)) {
        continue;
      }
      const qty = item.confirmedQuantity ?? item.requestedQuantity;
      const menuItem = menuItems.find((m) => m.id === item.branchMenuItemId);
      const minQty = menuItem ? resolveSkewerMinQty(menuItem) : SKEWER_MIN_QTY_PER_ITEM;
      if (qty >= minQty) {
        nextQtys[item.branchMenuItemId] = qty;
      }
    }
    setQtys(nextQtys);
    setAddressText(order.addressText || "");
    setMapValue({
      address: order.addressText || "",
      latitude: order.latitude,
      longitude: order.longitude,
    });
    setNote(order.note || "");
    if (opts.clearDate) {
      setRequestedDate("");
    }
  }

  // Prefill only when opening via reorder from history
  useEffect(() => {
    if (!reorderId || loading || menuItems.length === 0) return;
    const key = `${branchId}:${reorderId}`;
    if (prefillsDoneKey.current === key) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/skewer/orders/${encodeURIComponent(reorderId)}`,
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || cancelled) return;
        applyPrefill(data as PrefillOrder, { clearDate: true });
        setPrefillHint("เติมรายการจากออเดอร์ที่เลือกแล้ว — กรุณาเลือกวันที่ต้องการ");
      } catch {
        /* ignore prefill failures */
      } finally {
        if (!cancelled) prefillsDoneKey.current = key;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, menuItems, branchId, reorderId]);

  useEffect(() => {
    const fromMap = mapValue.address?.trim();
    if (fromMap && !addressText.trim()) {
      setAddressText(fromMap);
    }
  }, [mapValue.address, addressText]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sortOrder: number }>();
    for (const item of menuItems) {
      if (!item.category) continue;
      if (!map.has(item.category.id)) {
        map.set(item.category.id, item.category);
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || compareThaiText(a.name, b.name),
    );
  }, [menuItems]);

  /** Full branch menu in stock page order (stable seq source). Promo packs are not orderable sticks. */
  const catalogSorted = useMemo(
    () => sortMenuItemData(menuItems.filter((m) => isRegularMenuItem(m))),
    [menuItems],
  );

  const seqById = useMemo(
    () => assignStableMenuSequence(catalogSorted),
    [catalogSorted],
  );

  const visibleItems = useMemo(() => {
    const orderable = catalogSorted.filter((m) => !m.isOutOfStock);
    if (categoryFilter === "ALL") return orderable;
    return orderable.filter((m) => m.category?.id === categoryFilter);
  }, [catalogSorted, categoryFilter]);

  const { saleItems: visibleSaleItems, supplyItems: visibleSupplyItems } =
    useMemo(() => {
      const saleItems: MenuItem[] = [];
      const supplyItems: MenuItem[] = [];
      for (const item of visibleItems) {
        if (
          resolveSkewerCategoryRole({ category: item.category }) ===
          "SKEWER_SUPPLY"
        ) {
          supplyItems.push(item);
        } else {
          saleItems.push(item);
        }
      }
      return { saleItems, supplyItems };
    }, [visibleItems]);

  const showMenuRoleSections =
    categoryFilter === "ALL" &&
    visibleSaleItems.length > 0 &&
    visibleSupplyItems.length > 0;

  const selectedLines = useMemo(() => {
    return Object.entries(qtys)
      .map(([id, quantity]) => {
        const item = menuItems.find((m) => m.id === id);
        if (!item) return null;
        const minQty = resolveSkewerMinQty(item);
        if (quantity < minQty) return null;
        return {
          id,
          name: item.name,
          quantity,
          sticksPerUnit: resolveSticksPerUnit(item),
          countsAsSticks: resolveCountsAsSticks(item),
          skewerCategoryRole: resolveSkewerCategoryRole({ category: item.category }),
          seq: seqById.get(id) ?? 9999,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.seq - b!.seq) as {
      id: string;
      name: string;
      quantity: number;
      sticksPerUnit: number;
      countsAsSticks: boolean;
      skewerCategoryRole: "SKEWER_SALE" | "SKEWER_SUPPLY";
      seq: number;
    }[];
  }, [qtys, menuItems, seqById]);

  /** Full menu for review modal — stock sequence, qty 0 if not ordered. */
  const reviewRows = useMemo(() => {
    return catalogSorted.map((item) => {
      const quantity = qtys[item.id] ?? 0;
      const minQty = resolveSkewerMinQty(item);
      const ordered = quantity >= minQty;
      return {
        id: item.id,
        name: item.name,
        imageUrl: resolveSkewerMenuImageUrl(item),
        qtyUnit: resolveSkewerQtyUnit(item),
        sticksPerUnit: resolveSticksPerUnit(item),
        countsAsSticks: resolveCountsAsSticks(item),
        skewerCategoryRole: resolveSkewerCategoryRole({ category: item.category }),
        seq: seqById.get(item.id) ?? 0,
        quantity: ordered ? quantity : 0,
        ordered,
      };
    });
  }, [catalogSorted, qtys, seqById]);

  const orderSplitSummary = useMemo(
    () =>
      summarizeSkewerSplit(
        selectedLines.map((l) => ({
          quantity: l.quantity,
          sticksPerUnit: l.sticksPerUnit,
          countsAsSticks: l.countsAsSticks,
          skewerCategoryRole: l.skewerCategoryRole,
        })),
      ),
    [selectedLines],
  );
  const splitSummaryLabel = formatSkewerSplitSummary({
    sale: orderSplitSummary.sale,
    supplyItemCount: orderSplitSummary.supplyItemCount,
  });

  const { saleLines: reviewSaleRows, supplyLines: reviewSupplyRows } = useMemo(
    () => splitLinesBySkewerRole(reviewRows),
    [reviewRows],
  );

  function renderReviewRow(row: (typeof reviewRows)[number]) {
    return (
      <li
        key={row.id}
        className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 ${
          row.ordered ? "" : "opacity-40"
        }`}
      >
        <span
          className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
            row.ordered ? "text-gray-500" : "text-gray-300"
          }`}
        >
          {row.seq}
        </span>
        <div
          className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-site-primary-soft ${
            row.ordered ? "" : "grayscale"
          }`}
        >
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <IconSkewerPlaceholder size={20} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p
            className={`truncate text-sm leading-tight ${
              row.ordered
                ? "font-bold text-gray-900"
                : "font-medium text-gray-400"
            }`}
          >
            {row.name}
          </p>
          <p
            className={`mt-0.5 text-[11px] ${
              row.ordered ? "text-gray-500" : "text-gray-300"
            }`}
          >
            {row.ordered
              ? formatSkewerQtyLabel(row.quantity, {
                  quantityUnit: row.qtyUnit,
                  sticksPerUnit: row.sticksPerUnit,
                  countsAsSticks: row.countsAsSticks,
                })
              : "ไม่ได้สั่ง"}
          </p>
        </div>
        <div
          className={`min-w-[3.75rem] rounded-xl px-2.5 py-1.5 text-center ${
            row.ordered
              ? "bg-slate-100 text-slate-900"
              : "bg-gray-50 text-gray-300"
          }`}
        >
          <p className="text-base font-black tabular-nums leading-none">
            {row.quantity}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold opacity-70">สั่ง</p>
        </div>
      </li>
    );
  }

  const detailItem = detailItemId
    ? (visibleItems.find((m) => m.id === detailItemId) ??
      catalogSorted.find((m) => m.id === detailItemId) ??
      null)
    : null;
  const detailOpen = Boolean(detailItemId && detailItem);

  function clearValidation() {
    setError("");
    setAlertMessage(null);
    setAlertTitle("กรอกข้อมูลไม่ครบ");
    setHighlightId(null);
  }

  function fail(message: string, anchorId: string, title?: string) {
    setError(message);
    setAlertTitle(title ?? "กรอกข้อมูลไม่ครบ");
    setAlertMessage(message);
    setHighlightId(anchorId);
    window.setTimeout(() => {
      scrollToStaffAnchor(anchorId);
      const focusEl = document.querySelector<HTMLElement>(
        `#${anchorId} input, #${anchorId} textarea, #${anchorId} [data-skewer-focus]`,
      );
      focusEl?.focus({ preventScroll: true });
    }, 80);
  }

  function setQty(id: string, next: number) {
    clearValidation();
    const item = menuItems.find((m) => m.id === id);
    const normalized = item ? normalizeSkewerOrderQty(next, item) : next <= 0 ? 0 : next;
    setQtys((prev) => {
      const copy = { ...prev };
      if (normalized <= 0) delete copy[id];
      else copy[id] = normalized;
      return copy;
    });
  }

  function bumpQty(id: string, delta: number) {
    const item = menuItems.find((m) => m.id === id);
    if (!item) return;
    const current = qtys[id] ?? 0;
    const min = resolveSkewerMinQty(item);
    if (delta > 0) {
      setQty(id, current <= 0 ? min : current + delta);
      return;
    }
    setQty(id, current <= min ? 0 : current + delta);
  }

  function changeMenuView(next: SkewerMenuViewMode) {
    setMenuView(next);
    setDetailItemId(null);
    try {
      window.localStorage.setItem(SKEWER_MENU_VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function openItemDetail(id: string) {
    clearValidation();
    setDetailItemId(id);
    setDetailDraftQty(qtys[id] ?? 0);
  }

  function returnToMenuAtItem(id: string | null) {
    if (id) pendingScrollMenuIdRef.current = id;
    setDetailItemId(null);
  }

  function closeItemDetail() {
    returnToMenuAtItem(detailItemId);
  }

  function confirmItemDetail(qty: number) {
    if (!detailItemId) return;
    setQty(detailItemId, qty);
    returnToMenuAtItem(detailItemId);
  }

  useEffect(() => {
    if (highlightId === "skewer-map-field") {
      setShowAddressSearch(true);
    }
  }, [highlightId]);

  useEffect(() => {
    if (detailItemId != null) return;
    const id = pendingScrollMenuIdRef.current;
    if (!id) return;
    pendingScrollMenuIdRef.current = null;
    const anchorId = `skewer-menu-item-${id}`;
    const run = () => scrollToStaffAnchor(anchorId);
    // Wait until list/grid is painted after leaving the detail view.
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [detailItemId]);

  async function tryGeocodeAddress() {
    const q = addressText.trim();
    if (!q || (mapValue.latitude != null && mapValue.longitude != null)) {
      return mapValue;
    }
    try {
      const res = await fetch(
        `/api/customer/geocode?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json().catch(() => ({}));
      const hit = Array.isArray(data.results) ? data.results[0] : null;
      if (
        res.ok &&
        hit &&
        typeof hit.latitude === "number" &&
        typeof hit.longitude === "number"
      ) {
        const next = {
          address:
            typeof hit.label === "string" && hit.label.trim()
              ? hit.label
              : q,
          latitude: hit.latitude,
          longitude: hit.longitude,
        };
        setMapValue(next);
        return next;
      }
    } catch {
      /* optional pin */
    }
    return mapValue;
  }

  function validateForm(): boolean {
    clearValidation();
    if (!isOpen) {
      fail("สาขายังปิดรับออเดอร์ กรุณาลองใหม่ภายหลัง", "skewer-menu-section", "ยังไม่เปิดรับออเดอร์");
      return false;
    }
    if (selectedLines.length === 0) {
      fail(
        `กรุณาเลือกอย่างน้อย 1 เมนู — กดปุ่ม + ที่เมนูด้านบน`,
        "skewer-menu-section",
      );
      return false;
    }
    for (const line of selectedLines) {
      const item = menuItems.find((m) => m.id === line.id);
      if (!item) continue;
      const minQty = resolveSkewerMinQty(item);
      const unit = resolveSkewerQtyUnit(item);
      if (line.quantity < minQty) {
        fail(
          `${line.name} ต้องสั่งขั้นต่ำ ${minQty} ${unit}`,
          `skewer-menu-item-${line.id}`,
        );
        return false;
      }
    }
    if (!requestedDate) {
      fail(
        reorderId
          ? "กรุณาเลือกวันที่ต้องการสำหรับออเดอร์ใหม่นี้"
          : "กรุณาเลือกวันที่ต้องการรับ/ส่งไม้",
        "skewer-date-field",
      );
      return false;
    }
    const addr = addressText.trim();
    if (addr.length < 5) {
      fail(
        "กรุณากรอกที่อยู่จัดส่งหรือจุดนัดรับให้ชัดเจน (อย่างน้อย 5 ตัวอักษร)",
        "skewer-address-field",
      );
      return false;
    }
    return true;
  }

  function openReview() {
    if (!validateForm()) return;
    setReviewOpen(true);
  }

  async function submit() {
    if (!validateForm()) {
      setReviewOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      const addr = addressText.trim();
      const pin = await tryGeocodeAddress();
      const lat =
        pin.latitude != null && Number.isFinite(pin.latitude)
          ? pin.latitude
          : null;
      const lng =
        pin.longitude != null && Number.isFinite(pin.longitude)
          ? pin.longitude
          : null;

      const res = await fetch("/api/skewer/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          requestedDate,
          addressText: addr,
          latitude: lat,
          longitude: lng,
          note: note.trim() || undefined,
          items: selectedLines.map((l) => ({
            branchMenuItemId: l.id,
            quantity: l.quantity,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReviewOpen(false);
        fail(data.error || "สั่งไม่สำเร็จ", "skewer-menu-section", "ส่งคำสั่งไม่สำเร็จ");
        return;
      }
      setReviewOpen(false);
      router.replace(`/skewer/${branchId}/history/${data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  const highlightClass = (id: string) =>
    highlightId === id
      ? "ring-2 ring-amber-400 ring-offset-2 border-amber-300"
      : "border-gray-200";

  return (
    <SkewerAuthGate
      branchName={branchName || meta.brandName}
      brandLogoUrl={meta.brandLogoUrl}
      heroImageUrl={meta.branchImageUrl || meta.brandCoverUrl || null}
    >
      {meta.loading || loading ? (
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
        </main>
      ) : (
        <SkewerKeyOrderLayout
          branchId={branchId}
          title="สั่งเสียบไม้"
          subtitle={
            branchName
              ? `สาขา ${branchName.replace(/^สาขา\s*/, "")}`
              : undefined
          }
          footer={
            detailOpen ? undefined : (
              <button
                type="button"
                disabled={submitting || !isOpen}
                onClick={openReview}
                className="w-full rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
              >
                {selectedLines.length === 0
                  ? "ตรวจสอบคำสั่ง"
                  : `ตรวจสอบคำสั่ง · ${splitSummaryLabel}`}
              </button>
            )
          }
        >
          <StaffKeyOrderAlertModal
            open={Boolean(alertMessage)}
            title={alertTitle}
            message={alertMessage ?? ""}
            onClose={() => setAlertMessage(null)}
          />

          {reviewOpen ? (
            <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
              <button
                type="button"
                aria-label="ปิด"
                className="absolute inset-0"
                disabled={submitting}
                onClick={() => setReviewOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="skewer-review-title"
                className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
              >
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2
                    id="skewer-review-title"
                    className="text-base font-bold text-gray-900"
                  >
                    ตรวจสอบก่อนส่งคำสั่ง
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    ดูรายการให้ครบ แล้วกดยืนยันส่ง
                  </p>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                    <p>
                      <span className="text-gray-500">วันที่ต้องการ:</span>{" "}
                      <strong>
                        {requestedDate
                          ? new Date(
                              `${requestedDate}T12:00:00+07:00`,
                            ).toLocaleDateString("th-TH", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </strong>
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap">
                      <span className="text-gray-500">ที่อยู่:</span>{" "}
                      {addressText.trim()}
                    </p>
                    {note.trim() ? (
                      <p className="mt-1.5">
                        <span className="text-gray-500">โน้ต:</span> {note.trim()}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        สรุปรายการ
                      </p>
                      <p className="text-xs text-gray-500">{splitSummaryLabel}</p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-700">
                          {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE}
                        </p>
                        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                          {reviewSaleRows.map((row) => renderReviewRow(row))}
                        </ul>
                      </div>
                      {reviewSupplyRows.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-gray-700">
                            {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY}
                          </p>
                          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                            {reviewSupplyRows.map((row) => renderReviewRow(row))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 px-5 py-4">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setReviewOpen(false)}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-bold text-gray-800 disabled:opacity-50"
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submit()}
                    className="rounded-xl bg-site-primary px-3 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {submitting ? "กำลังส่ง…" : "ยืนยันส่ง"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {!isOpen && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              สาขายังปิดรับออเดอร์
            </p>
          )}

          {prefillHint ? (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              {prefillHint}
            </p>
          ) : null}

          <section
            id="skewer-menu-section"
            tabIndex={-1}
            className={`rounded-2xl border bg-white p-4 outline-none transition ${highlightClass("skewer-menu-section")}`}
          >
            {detailOpen && detailItem ? (
              <SkewerMenuItemQtyDetail
                name={detailItem.name}
                imageUrl={resolveSkewerMenuImageUrl(detailItem)}
                qtyUnit={resolveSkewerQtyUnit(detailItem)}
                sticksPerUnit={resolveSticksPerUnit(detailItem)}
                countsAsSticks={resolveCountsAsSticks(detailItem)}
                minQty={resolveSkewerMinQty(detailItem)}
                draftQty={detailDraftQty}
                onDraftChange={setDetailDraftQty}
                onBack={closeItemDetail}
                onConfirm={confirmItemDetail}
              />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-gray-900">
                      เลือกเมนู
                    </h2>
                    <p className="text-xs text-gray-500">
                      ลำดับเหมือนหน้าสต๊อก
                    </p>
                  </div>
                  <SkewerMenuViewToggle
                    value={menuView}
                    onChange={changeMenuView}
                  />
                </div>

                {menuView === "grid" ? (
                  <div className="mb-3 rounded-xl bg-site-primary-soft px-3 py-2.5">
                    <p className="text-xs font-medium text-gray-600">
                      รวมที่เลือก
                    </p>
                    <p className="text-lg font-black tabular-nums text-site-primary">
                      {splitSummaryLabel}
                    </p>
                  </div>
                ) : null}

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

                {menuView === "grid" ? (
                  showMenuRoleSections ? (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-700">
                          {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE}
                        </p>
                        <SkewerPhotoMenuGrid
                          items={visibleSaleItems.map((item) => ({
                            id: item.id,
                            name: item.name,
                            imageUrl: resolveSkewerMenuImageUrl(item),
                            qtyUnit: resolveSkewerQtyUnit(item),
                            sticksPerUnit: resolveSticksPerUnit(item),
                            countsAsSticks: resolveCountsAsSticks(item),
                          }))}
                          qtys={qtys}
                          onSelect={openItemDetail}
                        />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-700">
                          {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY}
                        </p>
                        <SkewerPhotoMenuGrid
                          items={visibleSupplyItems.map((item) => ({
                            id: item.id,
                            name: item.name,
                            imageUrl: resolveSkewerMenuImageUrl(item),
                            qtyUnit: resolveSkewerQtyUnit(item),
                            sticksPerUnit: resolveSticksPerUnit(item),
                            countsAsSticks: resolveCountsAsSticks(item),
                          }))}
                          qtys={qtys}
                          onSelect={openItemDetail}
                        />
                      </div>
                    </div>
                  ) : (
                    <SkewerPhotoMenuGrid
                      items={visibleItems.map((item) => ({
                        id: item.id,
                        name: item.name,
                        imageUrl: resolveSkewerMenuImageUrl(item),
                        qtyUnit: resolveSkewerQtyUnit(item),
                        sticksPerUnit: resolveSticksPerUnit(item),
                        countsAsSticks: resolveCountsAsSticks(item),
                      }))}
                      qtys={qtys}
                      onSelect={openItemDetail}
                    />
                  )
                ) : visibleItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                    ไม่พบเมนู
                  </p>
                ) : (
                  (() => {
                    const renderMenuRow = (item: MenuItem) => {
                      const qty = qtys[item.id] ?? 0;
                      const seq = seqById.get(item.id) ?? 0;
                      const displayImage = resolveSkewerMenuImageUrl(item);
                      const minQty = resolveSkewerMinQty(item);
                      return (
                        <li
                          key={item.id}
                          id={`skewer-menu-item-${item.id}`}
                          tabIndex={-1}
                          className="grid scroll-mt-24 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 outline-none first:pt-0 last:pb-0"
                        >
                          <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">
                            {seq}
                          </span>
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-site-primary-soft">
                            {displayImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={displayImage}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-gray-400">
                                <IconSkewerPlaceholder size={28} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {item.name}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {qty > 0
                                ? formatSkewerQtyLabel(qty, item)
                                : minQty > 1
                                  ? `ขั้นต่ำ ${minQty} ${resolveSkewerQtyUnit(item)}`
                                  : item.category?.name ||
                                    resolveSkewerQtyUnit(item)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-lg leading-none text-gray-700 disabled:opacity-40"
                              disabled={qty <= 0}
                              onClick={() => bumpQty(item.id, -1)}
                            >
                              −
                            </button>
                            <span className="min-w-[2rem] text-center text-sm font-bold tabular-nums">
                              {qty || "0"}
                            </span>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-site-primary text-lg leading-none text-white"
                              onClick={() => bumpQty(item.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </li>
                      );
                    };

                    if (!showMenuRoleSections) {
                      return (
                        <ul className="divide-y divide-gray-100">
                          {visibleItems.map(renderMenuRow)}
                        </ul>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        <div>
                          <p className="mb-2 text-xs font-semibold text-gray-700">
                            {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE}
                          </p>
                          <ul className="divide-y divide-gray-100">
                            {visibleSaleItems.map(renderMenuRow)}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold text-gray-700">
                            {SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY}
                          </p>
                          <ul className="divide-y divide-gray-100">
                            {visibleSupplyItems.map(renderMenuRow)}
                          </ul>
                        </div>
                      </div>
                    );
                  })()
                )}
              </>
            )}
          </section>

          {!detailOpen ? (
          <section
            id="skewer-delivery"
            tabIndex={-1}
            className={`space-y-3 rounded-2xl border bg-white p-4 outline-none transition ${
              highlightId === "skewer-date-field" ||
              highlightId === "skewer-address-field" ||
              highlightId === "skewer-map-field"
                ? "ring-2 ring-amber-400 ring-offset-2 border-amber-300"
                : "border-gray-200"
            }`}
          >
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                วันและที่อยู่
              </h2>
              <p className="text-xs text-gray-500">
                กรอกวันที่ต้องการและที่อยู่จัดส่ง / นัดรับ
              </p>
            </div>
            <div
              id="skewer-date-field"
              tabIndex={-1}
              className={`rounded-xl outline-none ${
                highlightId === "skewer-date-field"
                  ? "ring-2 ring-amber-400"
                  : ""
              }`}
            >
              <label className="text-sm font-medium text-gray-800">
                วันที่ต้องการ
              </label>
              <DateInput
                className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${
                  highlightId === "skewer-date-field"
                    ? "border-amber-400"
                    : "border-gray-200"
                }`}
                value={requestedDate}
                onChange={(v) => {
                  clearValidation();
                  setRequestedDate(v);
                }}
                min={bangkokDateKey()}
                required
                openPickerOnClick
                placeholder="เลือกวันที่ต้องการ"
              />
              {!requestedDate ? (
                <p className="mt-1 text-xs text-amber-700">
                  {reorderId
                    ? "สั่งซ้ำต้องเลือกวันที่ต้องการใหม่"
                    : "ต้องระบุวันที่ต้องการ"}
                </p>
              ) : null}
            </div>
            <div
              id="skewer-address-field"
              tabIndex={-1}
              className={`rounded-xl outline-none ${
                highlightId === "skewer-address-field"
                  ? "ring-2 ring-amber-400"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-800">
                  ที่อยู่จัดส่ง / นัดรับ
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddressSearch((v) => !v)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    showAddressSearch
                      ? "bg-site-primary text-white"
                      : "bg-gray-100 text-site-primary"
                  }`}
                >
                  {showAddressSearch
                    ? "ปิดค้นหา / แผนที่"
                    : "ค้นหาที่อยู่ / แผนที่"}
                </button>
              </div>
              <textarea
                className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${
                  highlightId === "skewer-address-field"
                    ? "border-amber-400"
                    : "border-gray-200"
                }`}
                rows={3}
                value={addressText}
                onChange={(e) => {
                  clearValidation();
                  setAddressText(e.target.value);
                }}
                onBlur={() => void tryGeocodeAddress()}
                placeholder="บ้านเลขที่ ถนน แขวง/ตำบล อำเภอ จังหวัด"
              />
              <p className="mt-1 text-xs text-gray-500">
                กรอกที่อยู่ให้ครบก็สั่งได้ — แผนที่เป็นตัวเลือกเสริม
              </p>
            </div>
            {showAddressSearch ||
            highlightId === "skewer-map-field" ? (
              <div
                id="skewer-map-field"
                tabIndex={-1}
                data-skewer-focus
                className={`rounded-xl outline-none ${
                  highlightId === "skewer-map-field"
                    ? "ring-2 ring-amber-400 p-1"
                    : ""
                }`}
              >
                <CustomerDeliveryMapPin
                  value={mapValue}
                  onChange={(next) => {
                    clearValidation();
                    setMapValue(next);
                  }}
                  referencePin={branchPin}
                  autoLocate={false}
                  showUseReferencePin={false}
                />
              </div>
            ) : (
              <div id="skewer-map-field" className="hidden" aria-hidden />
            )}
            <div>
              <label className="text-sm font-medium text-gray-800">
                โน้ต (ถ้ามี)
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
              />
            </div>
          </section>
          ) : null}

          {error && !alertMessage ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </SkewerKeyOrderLayout>
      )}
    </SkewerAuthGate>
  );
}

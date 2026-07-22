"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FulfillmentType, PaymentMethod } from "@prisma/client";
import { PAYMENT_METHOD_LABELS, CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH, formatPrice } from "@/lib/constants";
import type { BranchData } from "@/lib/customer-types";
import { lineTotal } from "@/lib/customer-types";
import {
  explainWhyOrdersBlocked,
  getBranchServiceStatus,
  isWithinWeeklyScheduleWithOvernight,
  listSelectableHhmmToday,
} from "@/lib/branch-hours";
import { hasMapPin } from "@/lib/geo";
import { localizedName } from "@/lib/localized";
import { clearMenuItemScroll } from "@/lib/menu-scroll-restore";
import { WheelTimePicker } from "@/components/WheelTimePicker";
import { useCustomer } from "@/components/customer/CustomerProvider";
import { useStaffKeyedOrder } from "@/hooks/useStaffKeyedOrder";
import { clearStaffKeyedOrder } from "@/lib/staff-keyed-order";
import { StaffOperatingRoundBanner } from "@/components/staff/StaffOperatingRoundBanner";
import { CustomerDeliveryMapPin } from "@/components/customer/CustomerDeliveryMapPin";
import type { MapLocationValue } from "@/components/customer/CustomerDeliveryMapPin";
import { LoadingState } from "@/components/LoadingState";
import {
  IconBack,
  IconBank,
  IconBranchPlaceholder,
  IconCard,
  IconCash,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconClose,
  IconDelivery,
  IconHome,
  IconLabel,
  IconMinus,
  IconNote,
  IconPhone,
  IconPin,
  IconPlus,
  IconSkewerPlaceholder,
  IconStore,
  IconTrash,
  IconUser,
} from "@/components/icons";

const ALLOWED_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "TRANSFER"];
const CHECKOUT_PATH = "/order/checkout";
const PENDING_SUBMIT_KEY = "skillsale_checkout_pending_submit";

const SWIPE_ACTION_WIDTH = 84;

function parseThaiTime(value: string) {
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    formatted: `${match[1].padStart(2, "0")}:${match[2]}`,
  };
}

function getBangkokDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function toBangkokScheduledAt(hours: number, minutes: number) {
  const now = new Date();
  let { year, month, day } = getBangkokDateParts(now);
  let scheduled = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+07:00`,
  );

  if (scheduled.getTime() < now.getTime()) {
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    year = tomorrow.getUTCFullYear();
    month = tomorrow.getUTCMonth() + 1;
    day = tomorrow.getUTCDate();
    scheduled = new Date(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+07:00`,
    );
  }

  return scheduled.toISOString();
}

function SwipeToReveal({
  open,
  onOpen,
  onClose,
  action,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  action: React.ReactNode;
  children: (args: { isOpen: boolean; close: () => void }) => React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  const base = open ? -SWIPE_ACTION_WIDTH : 0;
  const translateX = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, base + dx));

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setStartX(e.clientX);
    setDx(0);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const delta = e.clientX - startX;
    // Only allow horizontal swipe-left to open; swipe-right to close.
    setDx(delta);
  }

  function onPointerEnd() {
    if (!dragging) return;
    setDragging(false);
    const finalX = translateX;
    setDx(0);
    if (finalX <= -SWIPE_ACTION_WIDTH / 2) onOpen();
    else onClose();
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="absolute inset-y-0 right-0 flex w-[84px] items-stretch">
        {action}
      </div>
      <div
        className={`will-change-transform ${dragging ? "" : "transition-transform duration-200"} bg-white`}
        style={{ transform: `translateX(${translateX}px)`, touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {children({ isOpen: open, close: onClose })}
      </div>
    </div>
  );
}

type ExpandFieldId =
  | "scheduledTime"
  | "location"
  | "addressDetail"
  | "note";

const fieldInputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary";

const rowIconClass =
  "flex h-5 w-5 shrink-0 items-center justify-center overflow-visible";

function ExpandableFulfillmentRow({
  id,
  icon: Icon,
  label,
  summary,
  expanded,
  onToggle,
  children,
}: {
  id?: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  label: React.ReactNode;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div id={id}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-white px-3.5 py-3 text-left active:bg-gray-50"
      >
        <span className={rowIconClass}>
          <Icon size={16} className="text-gray-500" />
        </span>
        <span className="flex-1 text-sm text-gray-700">{label}</span>
        {!expanded && summary !== undefined && (
          <span
            className={`max-w-[45%] truncate text-right text-sm ${
              summary ? "text-gray-900" : "text-gray-400"
            }`}
          >
            {summary}
          </span>
        )}
        <IconChevronRight
          size={18}
          className={`shrink-0 text-gray-300 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>
      {expanded && children && (
        <div className="border-t border-gray-50 bg-gray-50/50 px-3.5 pb-3 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const {
    session,
    sessionChecked,
    cart,
    cartBranchId,
    fulfillment,
    setFulfillment,
    removeLine,
    clearCart,
  } = useCustomer();
  const {
    active: staffKeyedOrder,
    context: staffOrderContext,
    ready: staffKeyedReady,
  } = useStaffKeyedOrder();
  const isStaffKeyed = staffKeyedOrder && Boolean(staffOrderContext);

  const [branch, setBranch] = useState<BranchData | null>(null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [deliveryPin, setDeliveryPin] = useState<MapLocationValue>({
    address: "",
    latitude: null,
    longitude: null,
  });
  const [scheduledTime, setScheduledTime] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("TRANSFER");
  const [error, setError] = useState("");
  const [blockModal, setBlockModal] = useState<{
    title: string;
    message: string;
    items?: { branchMenuItemId?: string; name: string; reason: string }[];
    /** When true, dismissing removes these menu items from the cart */
    removeUnavailableOnDismiss?: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedField, setExpandedField] = useState<ExpandFieldId | null>(null);
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<
    {
      deliveryLocationId: string;
      locationName: string;
      addressDetail: string;
      deliveryFee: string;
      isCustomAddress?: boolean;
      deliveryLatitude?: number | null;
      deliveryLongitude?: number | null;
    }[]
  >([]);
  const savedAddressAppliedRef = useRef(false);

  useEffect(() => {
    if (!ALLOWED_PAYMENT_METHODS.includes(payment)) setPayment("TRANSFER");
  }, [payment]);

  useEffect(() => {
    setExpandedField(null);
    setBlockModal(null);
    setError("");
    if (fulfillment === "DELIVERY") {
      setScheduledTime("");
    }
  }, [fulfillment]);

  const checkoutService = useMemo(() => {
    if (!branch) return null;
    return getBranchServiceStatus(branch, fulfillment);
  }, [branch, fulfillment]);

  const availableTimes = useMemo(() => {
    if (!checkoutService) return [];
    return listSelectableHhmmToday(checkoutService.schedule, new Date(), 15);
  }, [checkoutService]);

  const scheduledHourOptions = useMemo(
    () => [...new Set(availableTimes.map((t) => t.slice(0, 2)))],
    [availableTimes],
  );

  const scheduledHour =
    scheduledTime.slice(0, 2) || scheduledHourOptions[0] || "09";

  const scheduledMinuteOptions = useMemo(
    () =>
      availableTimes
        .filter((t) => t.startsWith(`${scheduledHour}:`))
        .map((t) => t.slice(3)),
    [availableTimes, scheduledHour],
  );

  // Drop stale picks when hours/fulfillment change.
  useEffect(() => {
    if (!scheduledTime) return;
    if (availableTimes.length === 0 || !availableTimes.includes(scheduledTime)) {
      setScheduledTime("");
    }
  }, [availableTimes, scheduledTime]);

  function toggleExpanded(id: ExpandFieldId) {
    setExpandedField((f) => {
      const next = f === id ? null : id;
      if (
        next === "scheduledTime" &&
        !scheduledTime &&
        availableTimes[0]
      ) {
        setScheduledTime(availableTimes[0]);
      }
      return next;
    });
  }

  function onScheduledWheelChange(next: string) {
    const [h] = next.split(":");
    if (availableTimes.includes(next)) {
      setScheduledTime(next);
      return;
    }
    const fallback = availableTimes.find((t) => t.startsWith(`${h}:`));
    if (fallback) setScheduledTime(fallback);
  }

  function goToLogin(options?: { pendingSubmit?: boolean }) {
    if (options?.pendingSubmit) {
      sessionStorage.setItem(PENDING_SUBMIT_KEY, "1");
    }
    router.replace(
      `/order/login?returnTo=${encodeURIComponent(CHECKOUT_PATH)}`,
    );
  }

  function goBackToMenu() {
    if (isStaffKeyed && cartBranchId) {
      router.push(`/order/store/${cartBranchId}`);
      return;
    }
    if (cartBranchId) {
      router.push(`/order/store/${cartBranchId}`);
      return;
    }
    router.push(isStaffKeyed ? "/staff" : "/order");
  }

  useEffect(() => {
    if (!cartBranchId) {
      setBranch(null);
      setBranchLoading(false);
      return;
    }
    setBranchLoading(true);
    fetch("/api/customer/branches")
      .then((res) => res.json())
      .then((data: BranchData[] | unknown) => {
        const branches = Array.isArray(data) ? data : [];
        setBranch(branches.find((b) => b.id === cartBranchId) ?? null);
      })
      .finally(() => setBranchLoading(false));
  }, [cartBranchId]);

  // Load past delivery addresses for quick re-use (same branch).
  useEffect(() => {
    savedAddressAppliedRef.current = false;
    if (
      isStaffKeyed ||
      !session ||
      !cartBranchId ||
      fulfillment !== "DELIVERY"
    ) {
      setSavedAddresses([]);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/customer/delivery-addresses?branchId=${encodeURIComponent(cartBranchId)}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.items)) return;
        setSavedAddresses(data.items);
      })
      .catch(() => {
        if (!cancelled) setSavedAddresses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isStaffKeyed, session, cartBranchId, fulfillment]);

  const deliveryAvailable = (branch?.deliveryLocations.length ?? 0) > 0;

  const usableSavedAddresses = useMemo(() => {
    if (!branch) return [];
    const locIds = new Set(branch.deliveryLocations.map((l) => l.id));
    return savedAddresses.filter((a) => locIds.has(a.deliveryLocationId));
  }, [branch, savedAddresses]);

  const savedForSelectedZone = useMemo(() => {
    if (!locationId) return usableSavedAddresses;
    return usableSavedAddresses.filter(
      (a) => a.deliveryLocationId === locationId,
    );
  }, [usableSavedAddresses, locationId]);

  function applySavedAddress(saved: {
    deliveryLocationId: string;
    addressDetail: string;
    deliveryLatitude?: number | null;
    deliveryLongitude?: number | null;
  }) {
    setLocationId(saved.deliveryLocationId);
    setAddressDetail(saved.addressDetail);
    if (
      saved.deliveryLatitude != null &&
      saved.deliveryLongitude != null &&
      Number.isFinite(saved.deliveryLatitude) &&
      Number.isFinite(saved.deliveryLongitude)
    ) {
      setDeliveryPin({
        address: saved.addressDetail,
        latitude: saved.deliveryLatitude,
        longitude: saved.deliveryLongitude,
      });
    }
    setExpandedField(null);
    setError("");
  }

  // Auto-fill most recent saved delivery address once per checkout visit.
  useEffect(() => {
    if (fulfillment !== "DELIVERY") {
      savedAddressAppliedRef.current = false;
      return;
    }
    if (savedAddressAppliedRef.current) return;
    if (!branch || usableSavedAddresses.length === 0) return;
    if (locationId || addressDetail.trim()) return;
    const latest = usableSavedAddresses[0];
    if (!latest) return;
    savedAddressAppliedRef.current = true;
    applySavedAddress(latest);
  }, [
    fulfillment,
    branch,
    usableSavedAddresses,
    locationId,
    addressDetail,
  ]);

  // Wait for branch load — otherwise null branch looks like "no delivery".
  useEffect(() => {
    if (!branch) return;
    if (branch.deliveryLocations.length === 0 && fulfillment === "DELIVERY") {
      setFulfillment("PICKUP");
    }
  }, [branch, fulfillment, setFulfillment]);

  useEffect(() => {
    if (!session) return;
    if (sessionStorage.getItem(PENDING_SUBMIT_KEY) !== "1") return;
    sessionStorage.removeItem(PENDING_SUBMIT_KEY);
    void submitOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Set when an order was just placed, so the empty-cart redirect below
  // doesn't hijack the navigation to the confirmation page.
  const orderPlacedRef = useRef(false);

  useEffect(() => {
    if (orderPlacedRef.current) return;
    const ready = isStaffKeyed ? staffKeyedReady : sessionChecked;
    if (ready && cart.length === 0) {
      if (isStaffKeyed) {
        clearStaffKeyedOrder();
        router.replace("/staff");
        return;
      }
      if (cartBranchId) {
        router.replace(`/order/store/${cartBranchId}`);
      } else {
        router.replace("/order");
      }
    }
  }, [isStaffKeyed, staffKeyedReady, sessionChecked, cart.length, cartBranchId, router]);

  const itemsTotal = useMemo(
    () => cart.reduce((s, l) => s + lineTotal(l), 0),
    [cart],
  );
  const deliveryFee = useMemo(() => {
    if (fulfillment !== "DELIVERY" || !branch || !locationId) return 0;
    const loc = branch.deliveryLocations.find((l) => l.id === locationId);
    return loc ? Number(loc.deliveryFee) : 0;
  }, [fulfillment, branch, locationId]);
  const selectedDeliveryLocation = useMemo(() => {
    if (!branch || !locationId) return null;
    return branch.deliveryLocations.find((l) => l.id === locationId) ?? null;
  }, [branch, locationId]);
  const isCustomAddressZone = Boolean(
    selectedDeliveryLocation?.isCustomAddress,
  );
  const branchReferencePin =
    branch && hasMapPin(branch)
      ? {
          latitude: branch.latitude!,
          longitude: branch.longitude!,
          label: branch.name,
        }
      : null;

  const grandTotal = itemsTotal + deliveryFee;

  useEffect(() => {
    if (fulfillment === "DELIVERY" && isCustomAddressZone) {
      setExpandedField("addressDetail");
    }
  }, [fulfillment, isCustomAddressZone, locationId]);

  useEffect(() => {
    if (!isCustomAddressZone) {
      setDeliveryPin({ address: "", latitude: null, longitude: null });
    }
  }, [isCustomAddressZone]);

  function handleDeliveryPinChange(next: MapLocationValue) {
    setDeliveryPin(next);
    if (next.address.trim() && !addressDetail.trim()) {
      setAddressDetail(next.address.trim());
    }
  }

  function dismissBlockModal() {
    const modal = blockModal;
    setBlockModal(null);
    if (!modal?.removeUnavailableOnDismiss || !modal.items?.length) return;

    const ids = new Set(
      modal.items
        .map((it) => it.branchMenuItemId)
        .filter((id): id is string => Boolean(id)),
    );
    // Fallback: match by name if id missing (older responses)
    const names = new Set(
      modal.items
        .filter((it) => !it.branchMenuItemId)
        .map((it) => it.name.trim())
        .filter(Boolean),
    );

    for (const line of cart) {
      if (
        ids.has(line.branchMenuItemId) ||
        names.has(line.name.trim())
      ) {
        removeLine(line.key);
      }
    }
  }

  async function submitOrder() {
    const scrollAndExpand = (fieldId: ExpandFieldId) => {
      setExpandedField(fieldId);
      setTimeout(() => {
        document.getElementById(`field-${fieldId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    };

    setError("");
    setBlockModal(null);
    const customerName = isStaffKeyed
      ? (staffOrderContext!.staffDisplayName.trim() || staffOrderContext!.staffPhone)
      : (session?.name?.trim() ?? "");

    if (!isStaffKeyed) {
      if (!session) {
        goToLogin({ pendingSubmit: true });
        return;
      }
      if (!customerName) {
        goToLogin({ pendingSubmit: true });
        return;
      }
    }
    if (fulfillment === "DELIVERY" && !deliveryAvailable) {
      setBlockModal({
        title: "ยังสั่งจัดส่งไม่ได้",
        message:
          "สาขานี้ยังไม่เปิดบริการจัดส่ง กรุณาเปลี่ยนเป็นรับที่ร้านแทนนะคะ",
      });
      return;
    }
    if (fulfillment === "DELIVERY" && !locationId) {
      setError("กรุณาเลือกพื้นที่จัดส่ง");
      scrollAndExpand("location");
      return;
    }
    if (fulfillment === "DELIVERY" && !addressDetail.trim()) {
      setError(
        isCustomAddressZone
          ? "กรุณากรอกรายละเอียดที่อยู่ให้ครบ"
          : "กรุณากรอกรายละเอียดที่อยู่",
      );
      scrollAndExpand("addressDetail");
      return;
    }
    if (
      fulfillment === "DELIVERY" &&
      isCustomAddressZone &&
      addressDetail.trim().length < CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH
    ) {
      setError(
        `กรุณากรอกรายละเอียดที่อยู่ให้ละเอียดกว่านี้ (อย่างน้อย ${CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH} ตัวอักษร)`,
      );
      scrollAndExpand("addressDetail");
      return;
    }
    if (
      fulfillment === "DELIVERY" &&
      isCustomAddressZone &&
      !hasMapPin(deliveryPin)
    ) {
      setError("กรุณาปักหมุดจุดส่งบนแผนที่");
      scrollAndExpand("addressDetail");
      return;
    }
    let service;
    if (!isStaffKeyed && branch) {
      service = getBranchServiceStatus(branch, fulfillment);
      if (!service.acceptingOrders) {
        const explained = explainWhyOrdersBlocked(branch, fulfillment);
        setBlockModal(
          explained ?? {
            title: "ยังสั่งซื้อไม่ได้ตอนนี้",
            message: "กรุณากลับมาสั่งใหม่ในเวลาทำการนะคะ",
          },
        );
        return;
      }
      if (!service.openNow) {
        if (fulfillment === "DELIVERY") {
          setBlockModal({
            title: "ยังสั่งจัดส่งไม่ได้ตอนนี้",
            message:
              "ยังไม่ถึงเวลาเปิดจัดส่ง กรุณารอถึงเวลาเปิด หรือเปลี่ยนเป็นรับที่ร้านแล้วเลือกเวลารับล่วงหน้า",
          });
          return;
        }
        if (!scheduledTime.trim()) {
          setError(
            "ยังไม่ถึงเวลาเปิด กรุณาเลือกเวลารับสินค้าล่วงหน้าของวันนี้",
          );
          scrollAndExpand("scheduledTime");
          return;
        }
      }
    } else if (branch) {
      service = getBranchServiceStatus(branch, fulfillment);
    }
    const parsedScheduledTime =
      fulfillment === "PICKUP" && scheduledTime
        ? parseThaiTime(scheduledTime)
        : null;
    if (fulfillment === "PICKUP" && scheduledTime && !parsedScheduledTime) {
      setError("กรุณากรอกเวลารับสินค้าแบบ 24 ชั่วโมง เช่น 18:30");
      scrollAndExpand("scheduledTime");
      return;
    }
    if (parsedScheduledTime) {
      const scheduledAtPreview = toBangkokScheduledAt(
        parsedScheduledTime.hours,
        parsedScheduledTime.minutes,
      );
      const scheduledDate = new Date(scheduledAtPreview);
      if (scheduledDate.getTime() <= Date.now()) {
        setError("เวลานัดรับต้องเป็นเวลาหลังจากนี้ในวันนี้");
        scrollAndExpand("scheduledTime");
        return;
      }
      if (
        !isStaffKeyed &&
        service &&
        !isWithinWeeklyScheduleWithOvernight(service.schedule, scheduledDate)
      ) {
        setError("เวลารับสินค้าที่คุณระบุอยู่นอกเวลาทำการของร้าน กรุณาระบุเวลาใหม่");
        scrollAndExpand("scheduledTime");
        return;
      }
    } else if (
      !isStaffKeyed &&
      fulfillment === "PICKUP" &&
      branch &&
      service &&
      !service.openNow
    ) {
      setError("กรุณาเลือกเวลารับสินค้าล่วงหน้าของวันนี้");
      scrollAndExpand("scheduledTime");
      return;
    }
    setSubmitting(true);
    try {
      const scheduledAt = parsedScheduledTime
        ? toBangkokScheduledAt(
            parsedScheduledTime.hours,
            parsedScheduledTime.minutes,
          )
        : undefined;
      const res = await fetch(
        isStaffKeyed ? "/api/staff/orders" : "/api/customer/orders",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isStaffKeyed
            ? {
                fulfillmentType: fulfillment,
                deliveryLocationId:
                  fulfillment === "DELIVERY" ? locationId : undefined,
                addressDetail:
                  fulfillment === "DELIVERY" ? addressDetail : undefined,
                deliveryLatitude:
                  fulfillment === "DELIVERY" && hasMapPin(deliveryPin)
                    ? deliveryPin.latitude
                    : undefined,
                deliveryLongitude:
                  fulfillment === "DELIVERY" && hasMapPin(deliveryPin)
                    ? deliveryPin.longitude
                    : undefined,
                scheduledAt,
                note: note.trim() || undefined,
                paymentMethod: payment,
                items: cart.map((l) => ({
                  branchMenuItemId: l.branchMenuItemId,
                  quantity: l.quantity,
                  optionIds: l.optionIds ?? [],
                  note: l.note?.trim() || undefined,
                })),
              }
            : {
          branchId: cartBranchId,
          fulfillmentType: fulfillment,
          deliveryLocationId:
            fulfillment === "DELIVERY" ? locationId : undefined,
          addressDetail:
            fulfillment === "DELIVERY" ? addressDetail : undefined,
          deliveryLatitude:
            fulfillment === "DELIVERY" && hasMapPin(deliveryPin)
              ? deliveryPin.latitude
              : undefined,
          deliveryLongitude:
            fulfillment === "DELIVERY" && hasMapPin(deliveryPin)
              ? deliveryPin.longitude
              : undefined,
          customerName: customerName,
          scheduledAt,
          note: note.trim() || undefined,
          paymentMethod: payment,
          items: cart.map((l) => ({
            branchMenuItemId: l.branchMenuItemId,
            quantity: l.quantity,
            optionIds: l.optionIds ?? [],
            note: l.note?.trim() || undefined,
          })),
        },
        ),
      },
      );
      const data = await res.json();
      if (!res.ok) {
        const unavailable = Array.isArray(data.unavailableItems)
          ? (data.unavailableItems as {
              branchMenuItemId?: string;
              name: string;
              reason: string;
            }[])
          : undefined;
        if (unavailable?.length) {
          setBlockModal({
            title: "มีรายการที่สั่งไม่ได้",
            message:
              "รายการด้านล่างสั่งไม่ได้ในตอนนี้ เมื่อกดรับทราบ ระบบจะลบรายการเหล่านี้ออกจากตะกร้า และคำนวณราคารวมใหม่ให้",
            items: unavailable,
            removeUnavailableOnDismiss: true,
          });
        } else {
          setBlockModal({
            title: "สั่งซื้อไม่สำเร็จ",
            message:
              data.error ??
              "ไม่สามารถสั่งซื้อได้ กรุณาตรวจสอบรายการแล้วลองใหม่",
          });
        }
        setError("");
        return;
      }
      orderPlacedRef.current = true;
      clearCart();
      if (isStaffKeyed) {
        clearStaffKeyedOrder();
        router.replace("/staff");
        return;
      }
      router.replace(`/order/confirmation/${data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  const authReady = isStaffKeyed ? staffKeyedReady : sessionChecked;

  if (!authReady || (cart.length > 0 && branchLoading && !branch)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
        <LoadingState
          className="w-full max-w-sm"
          label={
            !authReady
              ? isStaffKeyed
                ? "กำลังโหลดโหมดคีย์ออเดอร์"
                : "กำลังตรวจสอบการเข้าสู่ระบบ"
              : "กำลังโหลดข้อมูลตะกร้า"
          }
        />
      </main>
    );
  }

  if (authReady && cart.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
        <LoadingState
          className="w-full max-w-sm"
          label="ตะกร้าว่าง — กำลังกลับไปหน้าร้าน"
          recoveryAfterMs={6_000}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBackToMenu}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="กลับ"
          >
            <IconBack size={22} />
          </button>
          <h1 className="font-bold text-gray-900">สรุปรายการสั่งซื้อ</h1>
        </div>
      </header>

      {isStaffKeyed && staffOrderContext ? (
        <div className="border-b border-gray-100 bg-white px-4 py-2">
          <StaffOperatingRoundBanner
            compact
            operatingDay={staffOrderContext.operatingDay}
            businessDayCutoffTime={staffOrderContext.businessDayCutoffTime}
            lateEntryUntilTime={staffOrderContext.lateEntryUntilTime}
          />
        </div>
      ) : null}

      {branch && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
          {branch.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branch.imageUrl}
              alt={branch.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-site-primary-soft">
              <IconBranchPlaceholder size={32} />
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900">
              {localizedName(branch.name, branch.nameTh, branch.nameEn)}
            </p>
            <p className="text-xs text-gray-500">
              {(() => {
                const s = getBranchServiceStatus(branch, fulfillment);
                if (s.openNow) {
                  return fulfillment === "DELIVERY"
                    ? "เปิดรับเดลิเวอรี"
                    : "ร้านเปิด";
                }
                if (s.acceptingOrders) return `${s.reason}`;
                return s.reason;
              })()}
            </p>
          </div>
        </div>
      )}

      <div className="mx-4 mt-3 rounded-xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
        <p className="mb-2 text-sm font-semibold text-gray-800">
          ข้อมูลการรับสินค้า
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => deliveryAvailable && setFulfillment("DELIVERY")}
            disabled={!deliveryAvailable}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              fulfillment === "DELIVERY"
                ? "border-site-primary bg-site-primary-soft text-site-primary"
                : "border-gray-200 text-gray-600"
            }`}
          >
            <IconDelivery size={18} />
            จัดส่ง
            {fulfillment === "DELIVERY" && <IconCheck size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setFulfillment("PICKUP")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium ${
              fulfillment === "PICKUP"
                ? "border-site-primary bg-site-primary-soft text-site-primary"
                : "border-gray-200 text-gray-600"
            }`}
          >
            <IconStore size={18} />
            รับที่ร้าน
            {fulfillment === "PICKUP" && <IconCheck size={14} />}
          </button>
        </div>
        {!deliveryAvailable && branch && !branchLoading && (
          <p className="mt-2 text-xs text-gray-500">
            สาขานี้ยังไม่เปิดจัดส่ง — สั่งรับที่ร้านได้เท่านั้น
          </p>
        )}

        {fulfillment === "PICKUP" && branch && (
          <div className="mt-3 flex items-start justify-between rounded-lg bg-gray-50 p-3">
            <div className="flex-1 pr-3">
              <p className="font-bold text-gray-900">
                {branch.brand?.name ? `${localizedName(branch.brand.name, branch.brand.nameTh, branch.brand.nameEn)} - ` : ""}
                {localizedName(branch.name, branch.nameTh, branch.nameEn)}
              </p>
              {branch.address && (
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{branch.address}</p>
              )}
            </div>
            {(branch.latitude && branch.longitude) || branch.address ? (
              <a
                href={
                  branch.latitude && branch.longitude
                    ? `https://maps.google.com/?q=${branch.latitude},${branch.longitude}`
                    : `https://maps.google.com/?q=${encodeURIComponent(branch.address || "")}`
                }
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm active:bg-gray-50"
              >
                <IconPin size={18} className="text-site-primary" />
                <span className="text-[10px] font-semibold text-gray-700">แผนที่</span>
              </a>
            ) : null}
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border border-gray-100">
          {isStaffKeyed || session?.name ? (
            <div
              className="flex w-full items-center gap-3 bg-white px-3.5 py-3 text-left"
              aria-label="ชื่อผู้สั่ง"
            >
              <span className={rowIconClass}>
                <IconUser size={16} className="text-gray-500" />
              </span>
              <span className="flex-1 text-sm text-gray-700">ชื่อผู้สั่ง</span>
              <span className="max-w-[45%] truncate text-sm text-gray-900">
                {isStaffKeyed
                  ? staffOrderContext!.staffDisplayName
                  : session!.name}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => goToLogin()}
              className="flex w-full items-center gap-3 bg-white px-3.5 py-3 text-left active:bg-gray-50"
            >
              <span className={rowIconClass}>
                <IconUser size={16} className="text-gray-500" />
              </span>
              <span className="flex-1 text-sm text-gray-700">ชื่อผู้สั่ง</span>
              <span className="text-sm text-gray-400">กรอกชื่อ</span>
              <IconChevronRight size={18} className="shrink-0 text-gray-300" />
            </button>
          )}

          <div className="h-px bg-gray-100" />
          {isStaffKeyed || session ? (
            <div
              className="flex w-full items-center gap-3 bg-white px-3.5 py-3 text-left"
              aria-label="เบอร์โทร"
            >
              <span className={rowIconClass}>
                <IconPhone size={16} className="text-gray-500" />
              </span>
              <span className="flex-1 text-sm text-gray-700">เบอร์โทร</span>
              <span className="text-sm text-gray-900">
                {isStaffKeyed ? staffOrderContext!.staffPhone : session!.phone}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => goToLogin()}
              className="flex w-full items-center gap-3 bg-white px-3.5 py-3 text-left active:bg-gray-50"
            >
              <span className={rowIconClass}>
                <IconPhone size={16} className="text-gray-500" />
              </span>
              <span className="flex-1 text-sm text-gray-700">เบอร์โทร</span>
              <span className="text-sm text-gray-400">ยังไม่เข้าสู่ระบบ</span>
              <IconChevronRight size={18} className="shrink-0 text-gray-300" />
            </button>
          )}

          {fulfillment === "PICKUP" && (
            <>
              <div className="h-px bg-gray-100" />
              <ExpandableFulfillmentRow
                id="field-scheduledTime"
                icon={IconClock}
                label="เวลารับสินค้า"
                summary={
                  scheduledTime ? `${scheduledTime} เป็นต้นไป` : "เลือกเวลา"
                }
                expanded={expandedField === "scheduledTime"}
                onToggle={() => toggleExpanded("scheduledTime")}
              >
                {availableTimes.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-gray-500">
                    ตอนนี้ไม่มีช่วงเวลาว่างสำหรับวันนี้
                  </p>
                ) : (
                  <div className="space-y-3">
                    <WheelTimePicker
                      value={
                        scheduledTime ||
                        availableTimes[0] ||
                        "09:00"
                      }
                      onChange={onScheduledWheelChange}
                      hourOptions={scheduledHourOptions}
                      minuteOptions={
                        scheduledMinuteOptions.length > 0
                          ? scheduledMinuteOptions
                          : ["00", "15", "30", "45"]
                      }
                    />
                    {checkoutService?.openNow ? (
                      <button
                        type="button"
                        onClick={() => setScheduledTime("")}
                        className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                      >
                        ไม่ระบุ — รับเร็วที่สุด
                      </button>
                    ) : null}
                    <p className="text-center text-[11px] text-gray-400">
                      เลือกได้ทีละ 15 นาที เฉพาะในช่วงเปิดร้านวันนี้
                    </p>
                  </div>
                )}
              </ExpandableFulfillmentRow>
            </>
          )}

          {fulfillment === "DELIVERY" && branch && (
            <>
              <div className="h-px bg-gray-100" />
              <ExpandableFulfillmentRow
                id="field-location"
                icon={IconPin}
                label="พื้นที่จัดส่ง"
                summary={(() => {
                  const loc = branch.deliveryLocations.find(
                    (l) => l.id === locationId,
                  );
                  if (!loc) return "เลือกพื้นที่";
                  const fee = Number(loc.deliveryFee);
                  return fee > 0
                    ? `${loc.name} · ค่าส่ง ฿${formatPrice(fee)}`
                    : loc.name;
                })()}
                expanded={expandedField === "location"}
                onToggle={() => toggleExpanded("location")}
              >
                <div className="space-y-2" role="radiogroup" aria-label="พื้นที่จัดส่ง">
                  {branch.deliveryLocations.map((loc) => {
                    const fee = Number(loc.deliveryFee);
                    const selected = locationId === loc.id;
                    const custom = Boolean(loc.isCustomAddress);
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setLocationId(loc.id);
                          if (custom) {
                            setExpandedField("addressDetail");
                            const match = usableSavedAddresses.find(
                              (a) => a.deliveryLocationId === loc.id,
                            );
                            if (match) {
                              applySavedAddress(match);
                            } else {
                              setDeliveryPin({
                                address: "",
                                latitude: null,
                                longitude: null,
                              });
                            }
                          }
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                          selected
                            ? "border-site-primary bg-site-primary-soft ring-1 ring-site-primary"
                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                            selected
                              ? "border-site-primary bg-site-primary"
                              : "border-gray-300 bg-white"
                          }`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">
                            {loc.name}
                          </span>
                          {custom ? (
                            <span className="mt-0.5 block text-xs leading-snug text-sky-700">
                              ปักหมุด + กรอกที่อยู่เอง
                            </span>
                          ) : loc.address ? (
                            <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                              {loc.address}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 pt-0.5 text-right text-sm font-semibold text-gray-800">
                          {fee > 0 ? `฿${formatPrice(fee)}` : "ฟรี"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ExpandableFulfillmentRow>

              <div className="h-px bg-gray-100" />
              <ExpandableFulfillmentRow
                id="field-addressDetail"
                icon={IconHome}
                label={
                  <>
                    รายละเอียดที่อยู่{" "}
                    <span className="text-site-primary">(บังคับ)</span>
                  </>
                }
                summary={
                  isCustomAddressZone
                    ? [
                        hasMapPin(deliveryPin) ? "ปักหมุดแล้ว" : "ปักหมุดจุดส่ง",
                        addressDetail.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "ปักหมุด + กรอกรายละเอียด"
                    : addressDetail || "เช่น ห้อง / ตึก / จุดสังเกต"
                }
                expanded={expandedField === "addressDetail"}
                onToggle={() => toggleExpanded("addressDetail")}
              >
                <div className="space-y-3">
                  {isCustomAddressZone ? (
                    <>
                      <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
                        ระบบจะปักหมุดจาก GPS และเติมที่อยู่จากแผนที่ให้อัตโนมัติ —
                        จากนั้นพิมพ์จุดสังเกตต่อท้ายได้ เช่น ตึกสีเทา มีฟิตเนสข้างหน้า
                      </p>
                      {(savedForSelectedZone.length > 0 ||
                        usableSavedAddresses.some((a) => a.isCustomAddress)) && (
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-gray-500">
                            จุดส่งที่เคยใช้
                          </p>
                          <div className="flex flex-col gap-2">
                            {(savedForSelectedZone.length > 0
                              ? savedForSelectedZone
                              : usableSavedAddresses.filter(
                                  (a) => a.isCustomAddress,
                                )
                            ).map((saved) => {
                              const active =
                                locationId === saved.deliveryLocationId &&
                                addressDetail.trim() ===
                                  saved.addressDetail.trim() &&
                                (saved.deliveryLatitude == null ||
                                  (deliveryPin.latitude ===
                                    saved.deliveryLatitude &&
                                    deliveryPin.longitude ===
                                      saved.deliveryLongitude));
                              return (
                                <button
                                  key={`${saved.deliveryLocationId}:${saved.addressDetail}:${saved.deliveryLatitude ?? ""}:${saved.deliveryLongitude ?? ""}`}
                                  type="button"
                                  onClick={() => applySavedAddress(saved)}
                                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                                    active
                                      ? "border-site-primary bg-site-primary-soft ring-1 ring-site-primary"
                                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                  }`}
                                >
                                  <span className="block text-sm font-medium text-gray-900">
                                    {saved.addressDetail}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-gray-500">
                                    {saved.locationName}
                                    {saved.deliveryLatitude != null
                                      ? " · มีหมุดบันทึกไว้"
                                      : ""}
                                    {Number(saved.deliveryFee) > 0
                                      ? ` · ค่าส่ง ฿${formatPrice(Number(saved.deliveryFee))}`
                                      : " · ฟรี"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <CustomerDeliveryMapPin
                        value={deliveryPin}
                        onChange={handleDeliveryPinChange}
                        referencePin={branchReferencePin}
                        autoLocate={!hasMapPin(deliveryPin)}
                      />
                    </>
                  ) : (
                    <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
                      ใช้บอกจุดส่งในพื้นที่ที่เลือก เช่น ห้อง ตึก จุดสังเกต —
                      ไม่ใช่หมายเหตุอาหาร
                    </p>
                  )}
                  {usableSavedAddresses.length > 0 && !isCustomAddressZone ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-500">
                        ที่อยู่ที่เคยใช้
                      </p>
                      <div className="flex flex-col gap-2">
                        {usableSavedAddresses.map((saved) => {
                          const active =
                            locationId === saved.deliveryLocationId &&
                            addressDetail.trim() === saved.addressDetail.trim();
                          return (
                            <button
                              key={`${saved.deliveryLocationId}:${saved.addressDetail}`}
                              type="button"
                              onClick={() => applySavedAddress(saved)}
                              className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                                active
                                  ? "border-site-primary bg-site-primary-soft ring-1 ring-site-primary"
                                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              <span className="block text-sm font-medium text-gray-900">
                                {saved.addressDetail}
                              </span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {saved.locationName}
                                {Number(saved.deliveryFee) > 0
                                  ? ` · ค่าส่ง ฿${formatPrice(Number(saved.deliveryFee))}`
                                  : " · ฟรี"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[11px] text-gray-400">
                        หรือกรอกรายละเอียดใหม่ด้านล่าง
                      </p>
                    </div>
                  ) : null}
                  <textarea
                    autoFocus={
                      isCustomAddressZone || usableSavedAddresses.length === 0
                    }
                    className={`${fieldInputClass} resize-none`}
                    value={addressDetail}
                    onChange={(e) => setAddressDetail(e.target.value)}
                    placeholder={
                      isCustomAddressZone
                        ? addressDetail.trim()
                          ? "เพิ่มจุดสังเกตต่อท้ายได้ เช่น ตึกสีเทา มีฟิตเนสข้างหน้า"
                          : "รอระบบเติมจากแผนที่ หรือพิมพ์ที่อยู่เอง…"
                        : "เช่น ห้อง 302 ตึก B / หน้าบ้านสีขาว"
                    }
                    rows={isCustomAddressZone ? 3 : 2}
                    maxLength={300}
                  />
                  {isCustomAddressZone ? (
                    <div className="flex items-start justify-between gap-3 text-[11px] leading-relaxed text-gray-500">
                      <p className="min-w-0 flex-1">
                        {deliveryPin.address.trim() &&
                        addressDetail.trim().startsWith(deliveryPin.address.trim())
                          ? "ที่อยู่ด้านบนมาจากแผนที่แล้ว — เพิ่มจุดสังเกตต่อท้ายได้ตามต้องการ"
                          : hasMapPin(deliveryPin)
                            ? "ปักหมุดแล้ว — ตรวจที่อยู่ให้ถูก และเพิ่มจุดสังเกตให้หาเจอง่ายขึ้น"
                            : "ปักหมุดก่อน ระบบจะช่วยเติมที่อยู่จากแผนที่"}
                      </p>
                      <span className="shrink-0 tabular-nums text-gray-400">
                        {addressDetail.trim().length}/
                        {CUSTOM_DELIVERY_ADDRESS_MIN_LENGTH}+
                      </span>
                    </div>
                  ) : null}
                </div>
              </ExpandableFulfillmentRow>
            </>
          )}

          <div className="h-px bg-gray-100" />
          <ExpandableFulfillmentRow
            icon={IconNote}
            label={
              <>
                หมายเหตุถึงร้าน{" "}
                <span className="text-gray-400">(ไม่บังคับ)</span>
              </>
            }
            summary={note || "เพิ่มหมายเหตุอาหาร"}
            expanded={expandedField === "note"}
            onToggle={() => toggleExpanded("note")}
          >
            <textarea
              autoFocus
              className={`${fieldInputClass} resize-none`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ไม่ใส่ผักชี / เผ็ดน้อย / ไม่เอาน้ำแข็ง"
              maxLength={200}
              rows={2}
            />
          </ExpandableFulfillmentRow>
        </div>
      </div>
      <div className="mx-4 mt-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">รายการอาหารที่สั่ง</h2>
        <Link href={`/order/store/${cartBranchId}`} className="text-sm font-semibold text-site-primary">
          สั่งอาหารเพิ่ม
        </Link>
      </div>

      <div className="mx-4 mt-3 space-y-3">
        {cart.map((l) => {
          const menuItem = branch?.menuItems.find(
            (m) => m.id === l.branchMenuItemId,
          );
          return (
            <div key={l.key} className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden">
              <SwipeToReveal
                open={openSwipeKey === l.key}
                onOpen={() => setOpenSwipeKey(l.key)}
                onClose={() =>
                  setOpenSwipeKey((k) => (k === l.key ? null : k))
                }
                action={
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    className="flex w-full items-center justify-center bg-red-500 text-sm font-semibold text-white"
                    aria-label={`ลบ ${l.name}`}
                  >
                    ลบ
                  </button>
                }
              >
                {({ isOpen, close }) => (
                  <button
                    type="button"
                    onClick={() => {
                      if (isOpen) {
                        close();
                        return;
                      }
                      clearMenuItemScroll();
                      router.push(
                        `/order/store/${cartBranchId}/item/${l.branchMenuItemId}?editKey=${encodeURIComponent(l.key)}&returnTo=${encodeURIComponent("/order/checkout")}`,
                      );
                    }}
                    className="flex w-full items-start gap-3 p-3 text-left active:bg-gray-50"
                    aria-label={`แก้ไข ${l.name}`}
                  >
                  {menuItem?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={menuItem.imageUrl}
                      alt={l.name}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-site-primary-soft">
                      <IconSkewerPlaceholder size={32} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-gray-900 pr-2">{l.name}</p>
                      <p className="font-semibold text-gray-700 shrink-0">
                        ฿{formatPrice(lineTotal(l))}
                      </p>
                    </div>
                    {l.optionNames?.length ? (
                      <p className="mt-1 break-all text-[13px] text-gray-500">
                        {l.optionNames.join(", ")}
                      </p>
                    ) : null}
                    {l.note ? (
                      <p className="mt-0.5 line-clamp-3 break-all text-[13px] text-gray-500">
                        หมายเหตุ: {l.note}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-end justify-between">
                      <span className="text-[15px] font-semibold text-site-primary">แก้ไข</span>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-site-primary-soft text-sm font-bold text-site-primary">
                        {l.quantity}
                      </div>
                    </div>
                  </div>
                </button>
              )}
              </SwipeToReveal>
            </div>
          );
        })}
      </div>

      <div className="mx-4 mt-3 rounded-xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
        <p className="mb-2 text-sm font-semibold text-gray-800">วิธีชำระเงิน</p>
        <div className="flex gap-2">
          {ALLOWED_PAYMENT_METHODS.map((pm) => {
            const PayIcon =
              pm === "CASH" ? IconCash : pm === "TRANSFER" ? IconBank : IconCard;
            return (
            <button
              key={pm}
              type="button"
              onClick={() => setPayment(pm)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-sm font-medium ${
                payment === pm
                  ? "border-site-primary bg-site-primary-soft text-site-primary"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              <PayIcon size={18} />
              {PAYMENT_METHOD_LABELS[pm]}
              {payment === pm && <IconCheck size={12} />}
            </button>
            );
          })}
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-xl border border-gray-100 bg-white p-3 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
        <div className="flex justify-between py-0.5 text-gray-600">
          <span>ค่าสินค้า</span>
          <span>฿{formatPrice(itemsTotal)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-gray-600">
          <span>ค่าจัดส่ง</span>
          <span>฿{formatPrice(deliveryFee)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-gray-100 pt-2 font-bold text-gray-900">
          <span>รวมทั้งหมด</span>
          <span className="text-site-primary">฿{formatPrice(grandTotal)}</span>
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-2 text-center text-sm text-red-600">{error}</p>
      )}

      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 bg-white px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={submitOrder}
          disabled={submitting}
          className="flex w-full items-center justify-between rounded-xl bg-site-primary px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[15px] font-bold text-site-primary">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </div>
            <span className="text-lg">
              {submitting ? "กำลังสั่งซื้อ..." : fulfillment === "PICKUP" ? "รับที่ร้าน" : "สั่งเลย"}
            </span>
          </div>
          <span className="text-lg font-bold">
            ฿{formatPrice(grandTotal)}
          </span>
        </button>
      </div>

      {blockModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-block-title"
          onClick={() => dismissBlockModal()}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="checkout-block-title"
                className="text-lg font-bold text-gray-900"
              >
                {blockModal.title}
              </h2>
              <button
                type="button"
                onClick={() => dismissBlockModal()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {blockModal.message}
            </p>
            {blockModal.items && blockModal.items.length > 0 ? (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {blockModal.items.map((it, idx) => (
                  <li
                    key={`${it.branchMenuItemId ?? it.name}-${idx}`}
                    className="leading-snug"
                  >
                    <span className="font-semibold">{it.name}</span>
                    <span className="text-red-700/80"> — {it.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => dismissBlockModal()}
              className="mt-5 w-full rounded-xl bg-site-primary py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              {blockModal.removeUnavailableOnDismiss
                ? "รับทราบ — ลบรายการออก"
                : "เข้าใจแล้ว"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

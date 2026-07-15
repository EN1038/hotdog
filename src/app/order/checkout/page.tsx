"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FulfillmentType, PaymentMethod } from "@prisma/client";
import { PAYMENT_METHOD_LABELS, formatPrice } from "@/lib/constants";
import type { BranchData } from "@/lib/customer-types";
import { lineTotal } from "@/lib/customer-types";
import { getBranchServiceStatus } from "@/lib/branch-hours";
import { localizedName } from "@/lib/localized";
import { useCustomer } from "@/components/customer/CustomerProvider";
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

function normalizeThaiTime(value: string) {
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  return value
    .replace(/[๐-๙]/g, (digit) => String(thaiDigits.indexOf(digit)))
    .replace(/[^\d:]/g, "")
    .slice(0, 5);
}

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
    <div
      className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="absolute inset-y-0 right-0 flex w-[84px] items-stretch">
        {action}
      </div>
      <div
        className={`will-change-transform ${dragging ? "" : "transition-transform duration-200"} bg-white`}
        style={{ transform: `translateX(${translateX}px)` }}
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
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100";

const rowIconClass = "flex h-5 w-5 shrink-0 items-center justify-center";

function ExpandableFulfillmentRow({
  icon: Icon,
  label,
  summary,
  expanded,
  onToggle,
  children,
}: {
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  label: React.ReactNode;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <>
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
    </>
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

  const [branch, setBranch] = useState<BranchData | null>(null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("TRANSFER");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedField, setExpandedField] = useState<ExpandFieldId | null>(null);
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);

  useEffect(() => {
    if (!ALLOWED_PAYMENT_METHODS.includes(payment)) setPayment("TRANSFER");
  }, [payment]);

  useEffect(() => {
    setExpandedField(null);
  }, [fulfillment]);

  function toggleExpanded(id: ExpandFieldId) {
    setExpandedField((f) => (f === id ? null : id));
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
    if (cartBranchId) {
      router.push(`/order/store/${cartBranchId}`);
      return;
    }
    router.push("/order");
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

  const deliveryAvailable = (branch?.deliveryLocations.length ?? 0) > 0;

  useEffect(() => {
    if (!deliveryAvailable && fulfillment === "DELIVERY") {
      setFulfillment("PICKUP");
    }
  }, [deliveryAvailable, fulfillment, setFulfillment]);

  useEffect(() => {
    if (!session) return;
    if (sessionStorage.getItem(PENDING_SUBMIT_KEY) !== "1") return;
    sessionStorage.removeItem(PENDING_SUBMIT_KEY);
    void submitOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const itemsTotal = useMemo(
    () => cart.reduce((s, l) => s + lineTotal(l), 0),
    [cart],
  );
  const deliveryFee = useMemo(() => {
    if (fulfillment !== "DELIVERY" || !branch || !locationId) return 0;
    const loc = branch.deliveryLocations.find((l) => l.id === locationId);
    return loc ? Number(loc.deliveryFee) : 0;
  }, [fulfillment, branch, locationId]);
  const discount = 0;
  const grandTotal = itemsTotal + deliveryFee - discount;

  async function submitOrder() {
    setError("");
    if (!session) {
      goToLogin({ pendingSubmit: true });
      return;
    }
    const customerName = session.name?.trim() ?? "";
    if (!customerName) {
      goToLogin({ pendingSubmit: true });
      return;
    }
    if (fulfillment === "DELIVERY" && !deliveryAvailable) {
      setError("สาขานี้ยังไม่เปิดจัดส่ง — กรุณาเลือกรับที่ร้าน");
      setFulfillment("PICKUP");
      return;
    }
    if (fulfillment === "DELIVERY" && (!locationId || !addressDetail.trim())) {
      setError("กรุณาเลือกพื้นที่จัดส่งและกรอกที่อยู่");
      return;
    }
    if (branch) {
      const service = getBranchServiceStatus(branch, fulfillment);
      if (!service.acceptingOrders) {
        setError(service.reason);
        return;
      }
      if (!service.openNow && !scheduledTime.trim()) {
        setError(
          "ยังไม่ถึงเวลาเปิด กรุณาเลือกเวลารับ/ส่งล่วงหน้าของวันนี้",
        );
        return;
      }
    }
    const parsedScheduledTime = scheduledTime
      ? parseThaiTime(scheduledTime)
      : null;
    if (scheduledTime && !parsedScheduledTime) {
      setError("กรุณากรอกเวลารับสินค้าแบบ 24 ชั่วโมง เช่น 18:30");
      return;
    }
    if (branch && !getBranchServiceStatus(branch, fulfillment).openNow) {
      if (!parsedScheduledTime) {
        setError("กรุณาเลือกเวลารับ/ส่งล่วงหน้าของวันนี้");
        return;
      }
      const scheduledAtPreview = toBangkokScheduledAt(
        parsedScheduledTime.hours,
        parsedScheduledTime.minutes,
      );
      const scheduledDate = new Date(scheduledAtPreview);
      if (scheduledDate.getTime() <= Date.now()) {
        setError("เวลานัดรับ/ส่งต้องเป็นเวลาหลังจากนี้ในวันนี้");
        return;
      }
    }
    setSubmitting(true);
    try {
      const scheduledAt = parsedScheduledTime
        ? toBangkokScheduledAt(
            parsedScheduledTime.hours,
            parsedScheduledTime.minutes,
          )
        : undefined;
      const res = await fetch("/api/customer/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: cartBranchId,
          fulfillmentType: fulfillment,
          deliveryLocationId:
            fulfillment === "DELIVERY" ? locationId : undefined,
          addressDetail:
            fulfillment === "DELIVERY" ? addressDetail : undefined,
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "สั่งซื้อไม่สำเร็จ");
        return;
      }
      clearCart();
      router.push(`/order/confirmation/${data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!sessionChecked || (cart.length > 0 && branchLoading && !branch)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  if (sessionChecked && cart.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-gray-500">ตะกร้าว่างเปล่า</p>
        <Link href="/order" className="text-red-500 underline">
          กลับไปเลือกเมนู
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
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

      {branch && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border bg-white p-3">
          {branch.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branch.imageUrl}
              alt={branch.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-red-200 to-orange-100">
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

      <div className="mx-4 mt-3 space-y-3">
        {cart.map((l) => {
          const menuItem = branch?.menuItems.find(
            (m) => m.id === l.branchMenuItemId,
          );
          return (
            <SwipeToReveal
              key={l.key}
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
                    router.push(
                      `/order/checkout/item/${encodeURIComponent(l.key)}`,
                    );
                  }}
                  className="flex w-full items-center gap-3 bg-white p-3 text-left active:bg-gray-50"
                  aria-label={`แก้ไข ${l.name}`}
                >
                  {menuItem?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={menuItem.imageUrl}
                      alt={l.name}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-100 to-orange-50">
                      <IconSkewerPlaceholder size={32} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">{l.name}</p>
                    <p className="mt-0.5 text-xs font-medium text-orange-500">
                      ฿{formatPrice(l.unitPrice + (l.optionsPrice ?? 0))} / ไม้
                    </p>
                    {l.optionNames?.length ? (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {l.optionNames.join(" • ")}
                      </p>
                    ) : null}
                    {l.note ? (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        หมายเหตุ: {l.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      x{l.quantity}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-gray-800">
                      ฿{formatPrice(lineTotal(l))}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-orange-600">
                      แก้ไข
                    </p>
                  </div>
                </button>
              )}
            </SwipeToReveal>
          );
        })}
      </div>

      <div className="mx-4 mt-3 rounded-xl border bg-white p-3">
        <p className="mb-2 text-sm font-semibold text-gray-800">
          ข้อมูลการรับสินค้า
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFulfillment("PICKUP")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium ${
              fulfillment === "PICKUP"
                ? "border-red-500 bg-red-50 text-red-600"
                : "border-gray-300 text-gray-600"
            }`}
          >
            <IconStore size={18} />
            รับที่ร้าน
            {fulfillment === "PICKUP" && <IconCheck size={14} />}
          </button>
          <button
            type="button"
            onClick={() => deliveryAvailable && setFulfillment("DELIVERY")}
            disabled={!deliveryAvailable}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              fulfillment === "DELIVERY"
                ? "border-red-500 bg-red-50 text-red-600"
                : "border-gray-300 text-gray-600"
            }`}
          >
            <IconDelivery size={18} />
            จัดส่ง
            {fulfillment === "DELIVERY" && <IconCheck size={14} />}
          </button>
        </div>
        {!deliveryAvailable && branch && !branchLoading && (
          <p className="mt-2 text-xs text-gray-500">
            สาขานี้ยังไม่เปิดจัดส่ง — สั่งรับที่ร้านได้เท่านั้น
          </p>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border border-gray-100">
          {session?.name ? (
            <div
              className="flex w-full items-center gap-3 bg-white px-3.5 py-3 text-left"
              aria-label="ชื่อผู้สั่ง"
            >
              <span className={rowIconClass}>
                <IconUser size={16} className="text-gray-500" />
              </span>
              <span className="flex-1 text-sm text-gray-700">ชื่อผู้สั่ง</span>
              <span className="max-w-[45%] truncate text-sm text-gray-900">
                {session.name}
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
          {session ? (
            <div
              className="flex w-full items-center gap-3 bg-white px-3.5 py-3 text-left"
              aria-label="เบอร์โทร"
            >
              <span className={rowIconClass}>
                <IconPhone size={16} className="text-gray-500" />
              </span>
              <span className="flex-1 text-sm text-gray-700">เบอร์โทร</span>
              <span className="text-sm text-gray-900">{session.phone}</span>
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

          <div className="h-px bg-gray-100" />
          <ExpandableFulfillmentRow
            icon={IconClock}
            label="เวลารับสินค้า"
            summary={
              scheduledTime ? `${scheduledTime} เป็นต้นไป` : "เลือกเวลา"
            }
            expanded={expandedField === "scheduledTime"}
            onToggle={() => toggleExpanded("scheduledTime")}
          >
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              className={fieldInputClass}
              value={scheduledTime}
              onChange={(e) =>
                setScheduledTime(normalizeThaiTime(e.target.value))
              }
              onBlur={() => {
                const parsed = parseThaiTime(scheduledTime);
                if (parsed) setScheduledTime(parsed.formatted);
              }}
              placeholder="16:30"
            />
          </ExpandableFulfillmentRow>

          {fulfillment === "DELIVERY" && branch && (
            <>
              <div className="h-px bg-gray-100" />
              <ExpandableFulfillmentRow
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
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setLocationId(loc.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                          selected
                            ? "border-red-300 bg-red-50/70 ring-1 ring-red-200"
                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                            selected
                              ? "border-red-500 bg-red-500"
                              : "border-gray-300 bg-white"
                          }`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">
                            {loc.name}
                          </span>
                          {loc.address ? (
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
                icon={IconHome}
                label="ที่อยู่จัดส่ง"
                summary={addressDetail || "กรอกที่อยู่"}
                expanded={expandedField === "addressDetail"}
                onToggle={() => toggleExpanded("addressDetail")}
              >
                <textarea
                  autoFocus
                  className={`${fieldInputClass} resize-none`}
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="เช่น ห้อง 302 ตึก B"
                  rows={2}
                  maxLength={300}
                />
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
            summary={note || "เพิ่มหมายเหตุ"}
            expanded={expandedField === "note"}
            onToggle={() => toggleExpanded("note")}
          >
            <textarea
              autoFocus
              className={`${fieldInputClass} resize-none`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ไม่ใส่ผักชี / เผ็ดน้อย"
              maxLength={200}
              rows={2}
            />
          </ExpandableFulfillmentRow>
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-xl border bg-white p-3">
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
                  ? "border-red-500 bg-red-50 text-red-600"
                  : "border-gray-300 text-gray-600"
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

      <div className="mx-4 mt-3 rounded-xl border bg-white p-3 text-sm">
        <div className="flex justify-between py-0.5 text-gray-600">
          <span>ค่าสินค้า</span>
          <span>฿{formatPrice(itemsTotal)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-gray-600">
          <span>ค่าจัดส่ง</span>
          <span>฿{formatPrice(deliveryFee)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-gray-600">
          <span>ส่วนลด</span>
          <span>฿{formatPrice(discount)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-2 font-bold text-gray-900">
          <span>รวมทั้งหมด</span>
          <span className="text-red-600">฿{formatPrice(grandTotal)}</span>
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-2 text-center text-sm text-red-600">{error}</p>
      )}

      <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t bg-white p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-gray-500">รวม</span>
          <span className="text-lg font-bold text-red-600">
            ฿{formatPrice(grandTotal)}
          </span>
        </div>
        <button
          type="button"
          onClick={submitOrder}
          disabled={submitting}
          className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? "กำลังสั่งซื้อ..." : "ยืนยันสั่งซื้อ"}
        </button>
      </div>
    </main>
  );
}

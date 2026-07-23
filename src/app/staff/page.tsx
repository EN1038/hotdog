"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { OrderCard, StatusLegend, type OrderCardData } from "@/components/OrderCard";
import { CancelReasonModal } from "@/components/CancelReasonModal";
import { logout } from "@/components/LoginForm";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import type { StaffRole } from "@/lib/constants";
import {
  formatPrice,
  formatStaffRoles,
  getStaffFilterStatuses,
  getStaffLegendStatuses,
} from "@/lib/constants";
import {
  playOrderAlertSound,
  STAFF_SOUND_PREF_KEY,
  unlockOrderAlertSound,
  vibrateForNewOrder,
} from "@/lib/staff-order-alert";
import { IconLogout, IconVolume, IconVolumeOff } from "@/components/icons";
import { StaffRoundSelector } from "@/components/staff/StaffRoundSelector";
import type { MenuItemData } from "@/lib/customer-types";
import { isPromoMenuItem } from "@/lib/staff-key-order";
import { takeStaffOrderFeedback } from "@/lib/staff-order-feedback";
import { formatQueueNumber } from "@/lib/order-queue-format";

const DEFAULT_DOC_TITLE = "Staff | SkillSale";

type BranchServiceSlice = {
  openNow: boolean;
  acceptingOrders: boolean;
  reason: string;
};

type BranchStatus = {
  isOpen: boolean;
  pickup: BranchServiceSlice;
  delivery: BranchServiceSlice;
};

type DayStats = {
  totalOrders: number;
  cancelledOrders: number;
  acceptedOrders: number;
  awaitingPhotoKeyOrders?: number;
  revenueBaht: number;
};

export default function StaffPage() {
  const router = useRouter();
  const branding = useSiteBranding();
  const { success: pushSuccessToast, error: pushErrorToast } = useToast();
  const [orders, setOrders] = useState<OrderCardData[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [branchName, setBranchName] = useState("");
  const [branchPin, setBranchPin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(false);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [operatingDay, setOperatingDay] = useState("");
  const [isViewingToday, setIsViewingToday] = useState(true);
  const [canEnter, setCanEnter] = useState(true);
  const [lateEntryUntilTime, setLateEntryUntilTime] = useState<string | null>(
    null,
  );
  const [businessDayCutoffTime, setBusinessDayCutoffTime] =
    useState("00:00");
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [promoLink, setPromoLink] = useState<{
    href: string;
    label: string;
  }>({ href: "/staff/key-order/promo", label: "แบบโปรโมชั่น" });
  const [creatingPhoto, setCreatingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [newOrderFlash, setNewOrderFlash] = useState(false);
  const [preferSound, setPreferSound] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(
    null,
  );
  const knownIdsRef = useRef<Set<string> | null>(null);
  const soundOnRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledToCreatedOrderRef = useRef(false);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    try {
      setPreferSound(localStorage.getItem(STAFF_SOUND_PREF_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const feedback = takeStaffOrderFeedback();
    if (!feedback) return;
    if (feedback.kind === "success") {
      pushSuccessToast(
        feedback.message,
        `${feedback.queueNumber != null ? `คิว ${formatQueueNumber(feedback.queueNumber)}` : "สร้างออเดอร์แล้ว"}${
          typeof feedback.totalAmount === "number"
            ? ` · ${formatPrice(feedback.totalAmount)}฿`
            : ""
        }`,
      );
    } else {
      pushErrorToast("บันทึกไม่สำเร็จ", feedback.message);
    }
    if (feedback.orderId) {
      scrolledToCreatedOrderRef.current = false;
      setStatusFilter(null);
      setHighlightedOrderId(feedback.orderId);
    }
  }, [pushErrorToast, pushSuccessToast]);

  const clearTitleAlert = useCallback(() => {
    if (titleTimerRef.current) {
      clearInterval(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    document.title = branchName
      ? `${branchName} · Staff`
      : DEFAULT_DOC_TITLE;
  }, [branchName]);

  const flashNewOrders = useCallback(
    (count: number) => {
      setNewOrderFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setNewOrderFlash(false), 8000);

      clearTitleAlert();
      let tick = false;
      document.title = `(${count}) ออเดอร์ใหม่!`;
      titleTimerRef.current = setInterval(() => {
        tick = !tick;
        document.title = tick
          ? `(${count}) ออเดอร์ใหม่!`
          : branchName
            ? `${branchName} · Staff`
            : DEFAULT_DOC_TITLE;
      }, 1200);
    },
    [branchName, clearTitleAlert],
  );

  const fetchOrders = useCallback(async () => {
    const qs = viewDate
      ? `?date=${encodeURIComponent(viewDate)}`
      : "";
    const res = await fetch(`/api/staff/orders${qs}`);
    if (res.status === 401) {
      router.push("/staff/login");
      return;
    }
    const data = await res.json();
    const nextOrders: OrderCardData[] = data.orders ?? [];
    const viewingToday = Boolean(data.isToday);
    setIsViewingToday(viewingToday);
    if (data.viewDate) setViewDate(data.viewDate);
    if (data.operatingDay) setOperatingDay(data.operatingDay);
    setCanEnter(data.canEnter !== false);
    setLateEntryUntilTime(
      typeof data.lateEntryUntilTime === "string"
        ? data.lateEntryUntilTime
        : null,
    );
    if (typeof data.businessDayCutoffTime === "string") {
      setBusinessDayCutoffTime(data.businessDayCutoffTime);
    }
    if (data.dayStats) setDayStats(data.dayStats);

    const nextIds = new Set(nextOrders.map((o) => o.id));

    if (!viewingToday) {
      knownIdsRef.current = nextIds;
    } else if (knownIdsRef.current === null) {
      knownIdsRef.current = nextIds;
    } else {
      const added = nextOrders.filter((o) => !knownIdsRef.current!.has(o.id));
      if (added.length > 0) {
        flashNewOrders(added.length);
        vibrateForNewOrder();
        if (soundOnRef.current) {
          playOrderAlertSound();
        }
      }
      knownIdsRef.current = nextIds;
    }

    setOrders(nextOrders);
    setRoles(data.roles ?? []);
    setBranchName(data.branchName ?? "");
    setBranchPin(data.branchPin ?? null);
    setAutoAcceptOrders(Boolean(data.autoAcceptOrders));
    if (data.branchStatus) setBranchStatus(data.branchStatus);
    setLoading(false);
  }, [router, flashNewOrders, viewDate]);

  function goToToday() {
    knownIdsRef.current = null;
    setViewDate(null);
    setLoading(true);
  }

  function onViewRoundChange(next: string) {
    if (!next) return;
    knownIdsRef.current = null;
    setViewDate(next);
    setLoading(true);
  }

  async function onPhotoSelected(file: File | null) {
    if (!file) return;
    setCreatingPhoto(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/staff/uploads", {
        method: "POST",
        body: form,
      });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok) {
        pushErrorToast("อัปโหลดรูปไม่สำเร็จ", upData.error ?? "ลองใหม่");
        return;
      }
      const res = await fetch("/api/staff/orders/photo-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: upData.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushErrorToast("เปิดคิวไม่สำเร็จ", data.error ?? "ลองใหม่");
        return;
      }
      pushSuccessToast(
        "เปิดคิวจากรูปแล้ว",
        data.queueNumber != null
          ? `คิว ${formatQueueNumber(data.queueNumber)} · คีย์รายการทีหลังได้`
          : "คีย์รายการทีหลังได้",
      );
      if (typeof data.id === "string") {
        setHighlightedOrderId(data.id);
        setStatusFilter(null);
        scrolledToCreatedOrderRef.current = false;
      }
      await fetchOrders();
    } catch {
      pushErrorToast("เปิดคิวไม่สำเร็จ", "ลองใหม่อีกครั้ง");
    } finally {
      setCreatingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  useEffect(() => {
    const legend = getStaffLegendStatuses(roles, { autoAcceptOrders });
    if (legend.length === 0) return;
    setStatusFilter((current) =>
      current && legend.includes(current) ? current : legend[0],
    );
  }, [roles, autoAcceptOrders]);

  const filteredOrders =
    statusFilter == null
      ? orders
      : orders.filter((o) =>
          getStaffFilterStatuses(statusFilter, roles).includes(o.status),
        );

  useEffect(() => {
    void fetchOrders();
    if (viewDate != null && operatingDay && viewDate !== operatingDay) return;
    const interval = setInterval(() => {
      void fetchOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders, viewDate, operatingDay]);

  useEffect(() => {
    if (viewDate != null && operatingDay && viewDate !== operatingDay) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchOrders();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchOrders, viewDate, operatingDay]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (titleTimerRef.current) clearInterval(titleTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      document.title = DEFAULT_DOC_TITLE;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/menu?channel=storefront");
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const items = Array.isArray(data.menuItems)
          ? (data.menuItems as MenuItemData[])
          : [];
        const promos = items.filter(
          (item) => isPromoMenuItem(item) && !item.isOutOfStock,
        );
        if (cancelled) return;
        if (promos.length === 1) {
          const only = promos[0]!;
          setPromoLink({
            href: `/staff/key-order/promo/${only.id}`,
            label: only.name,
          });
        } else {
          setPromoLink({
            href: "/staff/key-order/promo",
            label: "แบบโปรโมชั่น",
          });
        }
      } catch {
        /* keep default label */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!highlightedOrderId || scrolledToCreatedOrderRef.current) return;
    const target = orders.find((order) => order.id === highlightedOrderId);
    if (!target) return;
    const el = document.getElementById(`staff-order-card-${highlightedOrderId}`);
    if (!el) return;
    scrolledToCreatedOrderRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedOrderId(null);
    }, 5000);
  }, [orders, highlightedOrderId]);

  async function enableSound() {
    setSoundError("");
    try {
      const ok = await unlockOrderAlertSound();
      if (!ok) {
        setSoundError("เบราว์เซอร์นี้ไม่รองรับเสียงแจ้งเตือน");
        return;
      }
      playOrderAlertSound();
      setSoundOn(true);
      setPreferSound(true);
      try {
        localStorage.setItem(STAFF_SOUND_PREF_KEY, "1");
      } catch {
        /* ignore */
      }
    } catch {
      setSoundError("เปิดเสียงไม่สำเร็จ กรุณาแตะอีกครั้ง");
    }
  }

  function disableSound() {
    setSoundOn(false);
    setPreferSound(false);
    setSoundError("");
    try {
      localStorage.setItem(STAFF_SOUND_PREF_KEY, "0");
    } catch {
      /* ignore */
    }
  }

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    if (!isViewingToday || !canEnter) return;
    const res = await fetch(`/api/staff/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      clearTitleAlert();
      pushSuccessToast("อัปเดตสถานะแล้ว");
      void fetchOrders();
      return;
    }
    void fetchOrders();
    if (data.statusChanged) {
      pushErrorToast(
        "สถานะออเดอร์เปลี่ยนแล้ว",
        data.currentStatusLabel
          ? `${data.error ?? "อัปเดตไม่สำเร็จ"} สถานะปัจจุบัน: ${data.currentStatusLabel}`
          : (data.error ??
            "สถานะออเดอร์เปลี่ยนแล้ว — อัปเดตรายการให้ล่าสุดแล้ว"),
      );
      return;
    }
    pushErrorToast("อัปเดตไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
  }

  async function handleConfirmCancel(reason: string) {
    if (!cancelOrderId || !isViewingToday || !canEnter) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/staff/orders/${cancelOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: OrderStatus.CANCELLED,
          cancelReason: reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCancelOrderId(null);
        clearTitleAlert();
        pushSuccessToast("ยกเลิกออเดอร์แล้ว");
        void fetchOrders();
        return;
      }
      setCancelOrderId(null);
      void fetchOrders();
      if (data.statusChanged) {
        pushErrorToast(
          "สถานะออเดอร์เปลี่ยนแล้ว",
          data.currentStatusLabel
            ? `${data.error ?? "ยกเลิกไม่สำเร็จ"} สถานะปัจจุบัน: ${data.currentStatusLabel}`
            : (data.error ??
              "สถานะออเดอร์เปลี่ยนแล้ว — อัปเดตรายการให้ล่าสุดแล้ว"),
        );
        return;
      }
      pushErrorToast("ยกเลิกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {branding.isBrandOverride ? (
              <p className="text-xs font-medium text-site-primary">
                {branding.siteName}
              </p>
            ) : null}
            <h1 className="text-xl font-bold text-gray-900">{branchName}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!soundOn ? (
              <button
                type="button"
                onClick={enableSound}
                aria-label="เปิดเสียงแจ้งเตือน"
                title="เปิดเสียงแจ้งเตือน"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100"
              >
                <IconVolumeOff size={22} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={disableSound}
                aria-label="ปิดเสียงแจ้งเตือน"
                title="ปิดเสียงแจ้งเตือน"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              >
                <IconVolume size={22} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => logout("/staff/login")}
              aria-label="ออกจากระบบ"
              title="ออกจากระบบ"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-site-primary"
            >
              <IconLogout size={22} aria-hidden />
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-gray-600">
              พนักงาน: {formatStaffRoles(roles)}
            </p>
            {branchStatus ? (
              <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-gray-500">
                <p
                  className={
                    branchStatus.isOpen ? "text-emerald-700" : "text-red-700"
                  }
                >
                  สถานะร้าน:{" "}
                  {branchStatus.isOpen ? "เปิด" : "ปิดชั่วคราว"}
                </p>
                <p>
                  หน้าร้าน{" "}
                  {branchStatus.pickup.acceptingOrders ? "รับสั่งได้" : "ไม่รับ"}
                </p>
                <p>
                  เดลิเวอรี{" "}
                  {branchStatus.delivery.acceptingOrders
                    ? "รับสั่งได้"
                    : "ไม่รับ"}
                </p>
              </div>
            ) : null}
            <p
              className={`mt-1 text-[11px] font-medium ${
                autoAcceptOrders
                  ? "animate-pulse text-emerald-600"
                  : "text-gray-400"
              }`}
            >
              {autoAcceptOrders
                ? "รับออเดอร์อัตโนมัติ: เปิดอยู่"
                : "รับออเดอร์อัตโนมัติ: ปิดอยู่"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <StaffRoundSelector
              viewRound={viewDate}
              currentRound={operatingDay}
              businessDayCutoffTime={businessDayCutoffTime}
              lateEntryUntilTime={lateEntryUntilTime}
              isViewingCurrent={isViewingToday}
              onChangeRound={onViewRoundChange}
              onGoToCurrent={goToToday}
            />
          </div>
        </div>
      </header>

      {soundError ? (
        <p className="mb-3 text-xs text-red-600">{soundError}</p>
      ) : null}

      {dayStats ? (
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          <div className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <p className="text-[10px] text-gray-500">ทั้งหมด</p>
            <p className="text-base font-bold text-gray-900">
              {dayStats.totalOrders.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <p className="text-[10px] text-gray-500">รับแล้ว</p>
            <p className="text-base font-bold text-emerald-700">
              {dayStats.acceptedOrders.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <p className="text-[10px] text-gray-500">ยกเลิก</p>
            <p className="text-base font-bold text-red-700">
              {dayStats.cancelledOrders.toLocaleString("th-TH")}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <p className="text-[10px] text-gray-500">ยอดรวม</p>
            <p className="text-sm font-bold text-site-primary">
              {dayStats.revenueBaht.toLocaleString("th-TH")}฿
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-4 space-y-2">
        {isViewingToday && canEnter ? (
          <>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) =>
                void onPhotoSelected(e.target.files?.[0] ?? null)
              }
            />
            <button
              type="button"
              disabled={creatingPhoto}
              onClick={() => photoInputRef.current?.click()}
              className="flex w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
            >
              {creatingPhoto ? "กำลังเปิดคิว..." : "ถ่ายรูปเปิดคิว (คีย์ทีหลัง)"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/staff/key-order/regular"
                className="flex items-center justify-center rounded-xl bg-site-primary px-3 py-3.5 text-sm font-bold text-white shadow-sm hover:opacity-95"
              >
                แบบธรรมดา
              </Link>
              <Link
                href={promoLink.href}
                title={promoLink.label}
                className="flex items-center justify-center rounded-xl bg-amber-500 px-3 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600"
              >
                <span className="line-clamp-2 text-center leading-snug">
                  {promoLink.label}
                </span>
              </Link>
            </div>
            <Link
              href="/staff/new-order"
              className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              คีย์ออเดอร์แบบลูกค้า
            </Link>
          </>
        ) : isViewingToday && !canEnter ? (
          <div className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3.5 text-base font-semibold text-amber-800">
            ปิดรอบคีย์แล้ว
          </div>
        ) : (
          <button
            type="button"
            onClick={goToToday}
            className="flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-3.5 text-base font-semibold text-gray-500"
          >
            คีย์ออเดอร์ (กลับรอบปัจจุบันก่อน)
          </button>
        )}
      </div>

      {newOrderFlash && isViewingToday && (
        <div
          className="mb-4 animate-pulse rounded-xl border-2 border-site-primary bg-site-primary px-4 py-3 text-center text-base font-bold text-white"
          role="status"
        >
          มีออเดอร์ใหม่!
        </div>
      )}

      <div className="mb-4">
        <StatusLegend
          roles={roles}
          autoAcceptOrders={autoAcceptOrders}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {filteredOrders.length === 0 ? (
        <p className="rounded-lg bg-white p-8 text-center text-gray-500">
          {!isViewingToday
            ? "ไม่มีออเดอร์ในวันนี้"
            : statusFilter === OrderStatus.COMPLETED
              ? "ยังไม่มีออเดอร์ที่เสร็จสิ้นหรือยกเลิกวันนี้"
              : "ไม่มีออเดอร์ที่รอดำเนินการ"}
        </p>
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              roles={roles}
              showActions={isViewingToday && canEnter}
              collapsibleItems
              branchPin={branchPin}
              highlight={order.id === highlightedOrderId}
              onStatusChange={handleStatusChange}
              onRequestCancel={(id) => setCancelOrderId(id)}
            />
          ))}
        </div>
      )}

      <CancelReasonModal
        open={Boolean(cancelOrderId)}
        busy={cancelling}
        description="กรุณาระบุเหตุผลการยกเลิก — ระบบจะบันทึกเหตุผลนี้ไว้กับออเดอร์"
        onClose={() => {
          if (!cancelling) setCancelOrderId(null);
        }}
        onConfirm={handleConfirmCancel}
      />
    </main>
  );
}

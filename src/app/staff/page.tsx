"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { OrderCard, StatusLegend, type OrderCardData } from "@/components/OrderCard";
import { CancelReasonModal } from "@/components/CancelReasonModal";
import { logout } from "@/components/LoginForm";
import { LoadingState } from "@/components/LoadingState";
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import type { StaffRole } from "@/lib/constants";
import {
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
  revenueBaht: number;
};

export default function StaffPage() {
  const router = useRouter();
  const branding = useSiteBranding();
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
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [newOrderFlash, setNewOrderFlash] = useState(false);
  const [preferSound, setPreferSound] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const soundOnRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      void fetchOrders();
      return;
    }
    void fetchOrders();
    if (data.statusChanged) {
      setStatusNotice({
        title: "สถานะออเดอร์เปลี่ยนแล้ว",
        message: data.currentStatusLabel
          ? `${data.error ?? "อัปเดตไม่สำเร็จ"}\nสถานะปัจจุบัน: ${data.currentStatusLabel}`
          : (data.error ??
            "สถานะออเดอร์เปลี่ยนแล้ว — อัปเดตรายการให้ล่าสุดแล้ว"),
      });
    }
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
        void fetchOrders();
        return;
      }
      setCancelOrderId(null);
      void fetchOrders();
      if (data.statusChanged) {
        setStatusNotice({
          title: "สถานะออเดอร์เปลี่ยนแล้ว",
          message: data.currentStatusLabel
            ? `${data.error ?? "ยกเลิกไม่สำเร็จ"}\nสถานะปัจจุบัน: ${data.currentStatusLabel}`
            : (data.error ??
              "สถานะออเดอร์เปลี่ยนแล้ว — อัปเดตรายการให้ล่าสุดแล้ว"),
        });
      }
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

      {statusNotice ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <button
            type="button"
            aria-label="ปิด"
            className="absolute inset-0"
            onClick={() => setStatusNotice(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-bold text-gray-900">
              {statusNotice.title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {statusNotice.message}
            </p>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="mt-5 w-full rounded-xl bg-site-primary py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              รับทราบ
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

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
  bangkokDateKey,
  getStaffFilterStatuses,
  getStaffLegendStatuses,
} from "@/lib/constants";
import {
  playOrderAlertSound,
  STAFF_SOUND_PREF_KEY,
  unlockOrderAlertSound,
  vibrateForNewOrder,
} from "@/lib/staff-order-alert";

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

function formatViewDateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

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
  const [canToggleStore, setCanToggleStore] = useState(false);
  const [storeToggleBusy, setStoreToggleBusy] = useState(false);
  const [storeToggleError, setStoreToggleError] = useState("");
  const [viewDate, setViewDate] = useState(() => bangkokDateKey());
  const [isViewingToday, setIsViewingToday] = useState(true);
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
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
    const res = await fetch(
      `/api/staff/orders?date=${encodeURIComponent(viewDate)}`,
    );
    if (res.status === 401) {
      router.push("/staff/login");
      return;
    }
    const data = await res.json();
    const nextOrders: OrderCardData[] = data.orders ?? [];
    const viewingToday = Boolean(data.isToday);
    setIsViewingToday(viewingToday);
    if (data.viewDate) setViewDate(data.viewDate);
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
    setCanToggleStore(Boolean(data.canToggleStore));
    setLoading(false);
  }, [router, flashNewOrders, viewDate]);

  function goToToday() {
    const today = bangkokDateKey();
    knownIdsRef.current = null;
    setViewDate(today);
    setLoading(true);
  }

  function onViewDateChange(next: string) {
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
    if (viewDate !== bangkokDateKey()) return;
    const interval = setInterval(() => {
      void fetchOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders, viewDate]);

  useEffect(() => {
    if (viewDate !== bangkokDateKey()) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchOrders();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchOrders, viewDate]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (titleTimerRef.current) clearInterval(titleTimerRef.current);
      document.title = DEFAULT_DOC_TITLE;
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

  async function toggleStoreOpen(nextOpen: boolean) {
    if (!isViewingToday || !canToggleStore || storeToggleBusy) return;
    if (
      !nextOpen &&
      !window.confirm(
        "ปิดร้านชั่วคราว? ลูกค้าจะสั่งออเดอร์ออนไลน์ไม่ได้จนกว่าจะเปิดร้านอีกครั้ง (พนักงานยังคีย์ออเดอร์ได้)",
      )
    ) {
      return;
    }
    setStoreToggleBusy(true);
    setStoreToggleError("");
    try {
      const res = await fetch("/api/staff/branch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen: nextOpen }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStoreToggleError(data.error ?? "เปลี่ยนสถานะร้านไม่สำเร็จ");
        return;
      }
      if (data.isOpen != null) {
        setBranchStatus({
          isOpen: data.isOpen,
          pickup: data.pickup,
          delivery: data.delivery,
        });
      }
    } finally {
      setStoreToggleBusy(false);
    }
  }

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    if (!isViewingToday) return;
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
    if (!cancelOrderId || !isViewingToday) return;
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
          <div className="flex shrink-0 items-center gap-2">
            {!soundOn ? (
              <button
                type="button"
                onClick={enableSound}
                className="cursor-pointer rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
              >
                เปิดเสียง
              </button>
            ) : (
              <button
                type="button"
                onClick={disableSound}
                className="cursor-pointer rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                เสียงเปิด
              </button>
            )}
            <button
              type="button"
              onClick={() => logout("/staff/login")}
              className="cursor-pointer text-sm text-site-primary hover:underline"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-gray-600">
              พนักงาน: {formatStaffRoles(roles)}
            </p>
            {branchStatus ? (
              <div className="mt-1 text-[11px] leading-snug text-gray-500">
                <span
                  className={
                    branchStatus.isOpen ? "text-emerald-700" : "text-red-700"
                  }
                >
                  สถานะร้าน:{" "}
                  {branchStatus.isOpen ? "เปิด (สวิตช์)" : "ปิดชั่วคราว"}
                </span>
                {" · "}
                หน้าร้าน{" "}
                {branchStatus.pickup.acceptingOrders ? "รับสั่งได้" : "ไม่รับ"}
                {" · "}
                เดลิเวอรี{" "}
                {branchStatus.delivery.acceptingOrders
                  ? "รับสั่งได้"
                  : "ไม่รับ"}
                {canToggleStore && isViewingToday ? (
                  <span className="ml-1.5 inline-flex gap-1">
                    {branchStatus.isOpen ? (
                      <button
                        type="button"
                        disabled={storeToggleBusy}
                        onClick={() => void toggleStoreOpen(false)}
                        className="cursor-pointer font-semibold text-red-700 underline disabled:opacity-60"
                      >
                        ปิดร้าน
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={storeToggleBusy}
                        onClick={() => void toggleStoreOpen(true)}
                        className="cursor-pointer font-semibold text-emerald-700 underline disabled:opacity-60"
                      >
                        เปิดร้าน
                      </button>
                    )}
                  </span>
                ) : null}
              </div>
            ) : null}
            {storeToggleError ? (
              <p className="mt-0.5 text-[11px] text-red-600">
                {storeToggleError}
              </p>
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
          <div className="flex shrink-0 flex-col items-end gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              ดูรายการวันที่
            </label>
            <input
              type="date"
              value={viewDate}
              max={bangkokDateKey()}
              onChange={(e) => onViewDateChange(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
            />
            {!isViewingToday ? (
              <button
                type="button"
                onClick={goToToday}
                className="cursor-pointer text-xs font-semibold text-site-primary underline"
              >
                กลับวันนี้
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {soundError ? (
        <p className="mb-3 text-xs text-red-600">{soundError}</p>
      ) : null}

      {!soundOn && (
        <p className="mb-3 text-xs text-gray-500">
          {preferSound
            ? "แตะ «เปิดเสียง» ด้านบนเพื่อเปิดเสียงแจ้งเตือนอีกครั้ง (ต้องกดเองตามนโยบายเบราว์เซอร์)"
            : "แตะ «เปิดเสียง» ด้านบนเมื่อต้องการได้ยินแจ้งเตือนออเดอร์ใหม่"}
        </p>
      )}
      {!isViewingToday ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          กำลังดูข้อมูลวันที่ {formatViewDateLabel(viewDate)} —{" "}
          <button
            type="button"
            onClick={goToToday}
            className="cursor-pointer font-semibold text-site-primary underline"
          >
            กลับวันนี้
          </button>{" "}
          เพื่อรับออเดอร์ คีย์ออเดอร์ หรือเปลี่ยนสถานะ
        </div>
      ) : null}

      {dayStats ? (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] text-gray-500">ออเดอร์ทั้งหมด</p>
            <p className="text-lg font-bold text-gray-900">
              {dayStats.totalOrders}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] text-gray-500">รับแล้ว</p>
            <p className="text-lg font-bold text-emerald-700">
              {dayStats.acceptedOrders}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] text-gray-500">ยกเลิก</p>
            <p className="text-lg font-bold text-red-700">
              {dayStats.cancelledOrders}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] text-gray-500">ยอดรวม (เสร็จสิ้น)</p>
            <p className="text-lg font-bold text-site-primary">
              {dayStats.revenueBaht.toLocaleString("th-TH")} บาท
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-4">
        {isViewingToday ? (
          <Link
            href="/staff/new-order"
            className="flex w-full items-center justify-center rounded-xl bg-site-primary px-4 py-3.5 text-base font-bold text-white shadow-sm hover:opacity-95"
          >
            คีย์ออเดอร์
          </Link>
        ) : (
          <button
            type="button"
            onClick={goToToday}
            className="flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-3.5 text-base font-semibold text-gray-500"
          >
            คีย์ออเดอร์ (กลับวันนี้ก่อน)
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
              showActions={isViewingToday}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { OrderCard, StatusLegend, type OrderCardData } from "@/components/OrderCard";
import { CancelReasonModal } from "@/components/CancelReasonModal";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import type { StaffRole } from "@/lib/constants";
import {
  formatPrice,
  getStaffFilterStatuses,
  getStaffLegendStatuses,
} from "@/lib/constants";
import {
  playOrderAlertSound,
  setOrderAlertSoundUrl,
  STAFF_SOUND_PREF_KEY,
  unlockOrderAlertSound,
  vibrateForNewOrder,
} from "@/lib/staff-order-alert";
import {
  IconCamera,
  IconPrinter,
  IconVolume,
  IconVolumeOff,
} from "@/components/icons";
import { StaffRoundSelector } from "@/components/staff/StaffRoundSelector";
import type { MenuItemData } from "@/lib/customer-types";
import { listActivePromoMenuItems } from "@/lib/staff-key-order";
import { takeStaffOrderFeedback } from "@/lib/staff-order-feedback";
import { formatQueueNumber } from "@/lib/order-queue-format";
import {
  autoPrintQueueTickets,
  clampTicketCopies,
  formatTicketDateLabel,
  formatPrinterLabel,
  getPrintBridgeStatus,
  selectPrinter,
} from "@/lib/print-bridge";

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
  const { success: pushSuccessToast, error: pushErrorToast } = useToast();
  const [orders, setOrders] = useState<OrderCardData[]>([]);
  const [pendingWaitingCount, setPendingWaitingCount] = useState(0);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [branchName, setBranchName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchPin, setBranchPin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(false);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
  const [canToggleStore, setCanToggleStore] = useState(false);
  const [canSell, setCanSell] = useState(false);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [operatingDay, setOperatingDay] = useState("");
  const [isViewingToday, setIsViewingToday] = useState(true);
  const [canEnter, setCanEnter] = useState(true);
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [promoLink, setPromoLink] = useState<{
    href: string;
    label: string;
  }>({ href: "/staff/key-order/promo", label: "แบบโปรโมชั่น" });
  const [creatingPhoto, setCreatingPhoto] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [printBridgeReady, setPrintBridgeReady] = useState(false);
  const [printerConfigured, setPrinterConfigured] = useState(false);
  const [printerLabel, setPrinterLabel] = useState("ยังไม่เชื่อมเครื่องพิมพ์");
  const [queueTicketCopies, setQueueTicketCopies] = useState(1);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
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
  const userPickedStatusTabRef = useRef(false);

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
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/alert-sound");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data.alertSounds) ? data.alertSounds : [];
        const selectedId =
          typeof data.alertSoundId === "string" ? data.alertSoundId : "";
        const url =
          typeof data.alertSound?.fileUrl === "string"
            ? data.alertSound.fileUrl
            : (list.find(
                (s: { id?: string; fileUrl?: string }) => s.id === selectedId,
              )?.fileUrl ?? null);
        setOrderAlertSoundUrl(
          typeof url === "string" ? url : null,
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const status = getPrintBridgeStatus();
      setPrintBridgeReady(status.inApp);
      setPrinterConfigured(status.configured);
      if (status.inApp) {
        setPrinterLabel(formatPrinterLabel(status.printer));
      }
    };
    refresh();
    window.addEventListener("skillsale-print-ready", refresh);
    const id = window.setInterval(refresh, 1200);
    return () => {
      window.removeEventListener("skillsale-print-ready", refresh);
      window.clearInterval(id);
    };
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
      if (feedback.printTickets !== false) {
        // Only prints when APK has a configured printer; otherwise no-op
        autoPrintQueueTickets({
          queueNumber: feedback.queueNumber,
          orderNumber: feedback.orderNumber,
          dateLabel:
            formatTicketDateLabel(feedback.dateLabel) ||
            formatTicketDateLabel(operatingDay) ||
            formatTicketDateLabel(new Date().toISOString()),
          copies: clampTicketCopies(
            feedback.queueTicketCopies ?? queueTicketCopies,
          ),
          staffName: feedback.staffName,
          orderType: feedback.orderType,
          items: feedback.items,
          subtotal: feedback.subtotal,
          discount: feedback.discount,
          paymentMethod: feedback.paymentMethod,
          amountReceived: feedback.amountReceived,
          change: feedback.change,
          totalAmount: feedback.totalAmount,
          brandName: feedback.brandName || brandName,
          branchName: feedback.branchName || branchName,
          branchAddress: feedback.branchAddress || branchAddress,
        });
      }
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
    setCanSell(Boolean(data.canSell ?? data.canEnter));
    setCanToggleStore(Boolean(data.canToggleStore));
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
    setPendingWaitingCount(
      typeof data.pendingWaitingCount === "number"
        ? data.pendingWaitingCount
        : nextOrders.filter(
            (o) => o.status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
          ).length,
    );
    setRoles(data.roles ?? []);
    setBranchName(data.branchName ?? "");
    setBrandName(data.brand?.name ?? "");
    setBranchAddress(data.branchAddress ?? "");
    setBranchPin(data.branchPin ?? null);
    setAutoAcceptOrders(Boolean(data.autoAcceptOrders));
    if (data.branchStatus) setBranchStatus(data.branchStatus);
    if (data.brand?.queueTicketCopies != null) {
      setQueueTicketCopies(clampTicketCopies(data.brand.queueTicketCopies));
    }
    setLoading(false);
  }, [router, flashNewOrders, viewDate]);

  function goToToday() {
    knownIdsRef.current = null;
    setViewDate(null);
    setLoading(true);
  }

  /** Switch to current round without full-page loading (keeps open-shift modal mounted). */
  function goToTodayQuiet() {
    if (isViewingToday) return;
    knownIdsRef.current = null;
    setViewDate(null);
  }

  function onViewRoundChange(next: string) {
    if (!next) return;
    knownIdsRef.current = null;
    setViewDate(next);
    setLoading(true);
  }

  async function onPhotoSelected(file: File | null) {
    if (!file) return;
    setPhotoPickerOpen(false);
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
      autoPrintQueueTickets({
        queueNumber: data.queueNumber,
        orderNumber:
          typeof data.orderNumber === "string" ? data.orderNumber : null,
        dateLabel:
          formatTicketDateLabel(
            typeof data.operatingDay === "string"
              ? data.operatingDay
              : typeof data.queueBusinessDate === "string"
                ? data.queueBusinessDate
                : operatingDay,
          ) || formatTicketDateLabel(new Date().toISOString()),
        copies: clampTicketCopies(
          typeof data.queueTicketCopies === "number"
            ? data.queueTicketCopies
            : queueTicketCopies,
        ),
        brandName,
        branchName,
        branchAddress,
      });
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
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  useEffect(() => {
    const waiting = Math.max(
      pendingWaitingCount,
      orders.filter(
        (o) => o.status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
      ).length,
    );
    const legend = getStaffLegendStatuses(roles, {
      autoAcceptOrders,
      hasWaitingOrders: waiting > 0,
    });
    if (legend.length === 0) return;
    setStatusFilter((current) => {
      // มีออเดอร์รอรับ — พาไปแท็บรอรับทันที (ยกเว้นผู้ใช้เลือกแท็บอื่นเองแล้ว)
      if (
        waiting > 0 &&
        !userPickedStatusTabRef.current &&
        legend.includes(OrderStatus.WAITING_FOR_STORE_ACCEPTANCE)
      ) {
        return OrderStatus.WAITING_FOR_STORE_ACCEPTANCE;
      }
      if (current && legend.includes(current)) return current;
      return legend[0]!;
    });
  }, [roles, autoAcceptOrders, orders, pendingWaitingCount]);

  const waitingCount = Math.max(
    pendingWaitingCount,
    orders.filter(
      (o) => o.status === OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
    ).length,
  );
  /** รวมออเดอร์ในลิสต์ (รวมรอรับข้ามวัน) ไม่ใช้แค่สถิติรอบปัจจุบัน */
  const totalOrderCount = Math.max(dayStats?.totalOrders ?? 0, orders.length);
  const revenueBaht = dayStats?.revenueBaht ?? 0;

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
    const onReload = () => {
      void fetchOrders();
    };
    const onBeforeOpen = () => {
      goToTodayQuiet();
    };
    window.addEventListener("staff-branding-reload", onReload);
    window.addEventListener("staff-shift-before-open", onBeforeOpen);
    return () => {
      window.removeEventListener("staff-branding-reload", onReload);
      window.removeEventListener("staff-shift-before-open", onBeforeOpen);
    };
  }, [fetchOrders]);

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
        const promos = listActivePromoMenuItems(items);
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
      <StaffAppShell active="orders" showHeader={false}>
        <main className="flex min-h-[60vh] items-center justify-center px-4">
          <LoadingState className="w-full max-w-sm" />
        </main>
      </StaffAppShell>
    );
  }

  return (
    <StaffAppShell active="orders">
    <main className="p-4">
      {/* หัวสั้น: ชื่อ + สถานะ | เสียง/พิมพ์ + รอบ */}
      <header className="mb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[18px] font-extrabold leading-tight text-gray-900">
              ออเดอร์วันนี้
            </h1>
            <p className="mt-0.5 truncate text-[12px] font-medium text-slate-500">
              {branchStatus?.isOpen ? (
                <span className="text-emerald-700">ร้านเปิด</span>
              ) : (
                <span className="text-red-600">ร้านปิด</span>
              )}
              {" · "}
              {autoAcceptOrders ? "รับออโต้" : "รับมือ"}
              {" · "}
              <span className="tabular-nums text-slate-700">
                รอรับ {waitingCount.toLocaleString("th-TH")}
              </span>
              {" · "}
              <span className="tabular-nums text-slate-700">
                ทั้งหมด {totalOrderCount.toLocaleString("th-TH")}
              </span>
              {" · "}
              <span className="tabular-nums font-semibold text-site-primary">
                {revenueBaht.toLocaleString("th-TH")}฿
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!soundOn ? (
              <button
                type="button"
                onClick={enableSound}
                aria-label="เปิดเสียงแจ้งเตือน"
                title="เปิดเสียงแจ้งเตือน"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400 bg-amber-50 text-amber-950"
              >
                <IconVolumeOff size={20} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={disableSound}
                aria-label="ปิดเสียงแจ้งเตือน"
                title="ปิดเสียงแจ้งเตือน"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900"
              >
                <IconVolume size={20} aria-hidden />
              </button>
            )}
            {printBridgeReady ? (
              <button
                type="button"
                onClick={() => selectPrinter()}
                aria-label={printerLabel}
                title={printerLabel}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                  printerConfigured
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-300 bg-amber-50 text-amber-950"
                }`}
              >
                <IconPrinter size={18} aria-hidden />
              </button>
            ) : null}
            <StaffRoundSelector
              compact
              viewRound={viewDate}
              currentRound={operatingDay}
              isViewingCurrent={isViewingToday}
              onChangeRound={onViewRoundChange}
              onGoToCurrent={goToToday}
            />
          </div>
        </div>

        {soundError ? (
          <p className="mt-1.5 text-[13px] text-red-600">{soundError}</p>
        ) : null}
      </header>

      {/* คีย์ออเดอร์ — แถวเดียว (งานหลักอยู่หน้าหลัก) */}
      <div className="mb-3">
        {isViewingToday && canEnter ? (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) =>
                void onPhotoSelected(e.target.files?.[0] ?? null)
              }
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) =>
                void onPhotoSelected(e.target.files?.[0] ?? null)
              }
            />
            {photoPickerOpen ? (
              <div
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
                role="dialog"
                aria-modal="true"
                aria-label="เลือกแหล่งรูป"
                onClick={() => setPhotoPickerOpen(false)}
              >
                <div
                  className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-center text-base font-bold text-gray-900">
                    เปิดคิวด้วยรูป
                  </p>
                  <p className="mt-1 text-center text-xs text-gray-500">
                    ถ่ายใหม่ตอนเร่งด่วน หรือเลือกจากคลังถ้ามีรูปอยู่แล้ว
                  </p>
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      disabled={creatingPhoto}
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60"
                    >
                      ถ่ายรูปด้วยกล้อง
                    </button>
                    <button
                      type="button"
                      disabled={creatingPhoto}
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      เลือกจากคลังภาพ
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoPickerOpen(false)}
                      className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-[2.75rem_1.35fr_1fr_1fr] gap-1.5">
              <button
                type="button"
                disabled={creatingPhoto}
                onClick={() => setPhotoPickerOpen(true)}
                aria-label={
                  creatingPhoto
                    ? "กำลังเปิดคิว..."
                    : "ถ่ายรูปเปิดคิว (คีย์ทีหลัง)"
                }
                title={
                  creatingPhoto
                    ? "กำลังเปิดคิว..."
                    : "ถ่ายรูปเปิดคิว (คีย์ทีหลัง)"
                }
                className="flex min-h-11 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm disabled:opacity-60"
              >
                <IconCamera size={22} aria-hidden />
              </button>
              <Link
                href="/staff/key-order/regular"
                className="flex min-h-11 items-center justify-center rounded-xl bg-site-primary px-2 text-[13px] font-extrabold text-white shadow-sm"
              >
                คีย์ออเดอร์
              </Link>
              <Link
                href={promoLink.href}
                title={promoLink.label}
                className="flex min-h-11 items-center justify-center rounded-xl bg-amber-500 px-2 text-[12px] font-extrabold text-white shadow-sm"
              >
                <span className="line-clamp-2 text-center leading-snug">
                  {promoLink.label}
                </span>
              </Link>
              <Link
                href="/staff/new-order"
                className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-700"
              >
                แบบลูกค้า
              </Link>
            </div>
          </>
        ) : isViewingToday && !canEnter ? (
          <div className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-800">
            <span>กลับหน้าหลักแล้วเปิดรอบขายก่อน</span>
            {!canToggleStore ? (
              <span className="text-xs font-normal text-amber-700">
                เฉพาะพนักงานขายที่เปิด/ปิดร้านได้
              </span>
            ) : null}
            <Link
              href="/staff"
              className="mt-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white"
            >
              ไปหน้าหลัก
            </Link>
          </div>
        ) : (
          <button
            type="button"
            onClick={goToToday}
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            <span>กำลังดูรอบอื่น — แตะเพื่อกลับรอบปัจจุบัน</span>
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
          waitingCount={waitingCount}
          value={statusFilter}
          onChange={(status) => {
            userPickedStatusTabRef.current = true;
            setStatusFilter(status);
          }}
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
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              roles={roles}
              showActions={isViewingToday && canEnter}
              collapsibleItems
              compactTools
              branchPin={branchPin}
              highlight={order.id === highlightedOrderId}
              queueTicketCopies={queueTicketCopies}
              ticketDateLabel={
                formatTicketDateLabel(viewDate ?? operatingDay) ||
                formatTicketDateLabel(order.createdAt)
              }
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
    </StaffAppShell>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import {
  resolveStaffHomePromoButton,
  type StaffHomePromoButton,
} from "@/lib/staff-key-order";
import type { MenuItemData } from "@/lib/customer-types";
import { useToast } from "@/components/admin/Toast";
import {
  type ActiveShiftInfo,
  StaffShiftControls,
} from "@/components/staff/StaffShiftControls";
import { StaffPrepTipBanner } from "@/components/staff/StaffPrepTipBanner";
import { AddToHomeScreenBanner } from "@/components/staff/AddToHomeScreenBanner";
import { takeStaffOrderFeedback } from "@/lib/staff-order-feedback";
import { formatQueueNumber } from "@/lib/order-queue-format";
import { formatPrice } from "@/lib/constants";
import {
  IconBoxes,
  IconCart,
  IconChartBars,
  IconChevronRight,
  IconClipboard,
  IconLinkSuffix,
  IconPackage,
  IconQrCode,
  IconStar,
  IconWallet,
} from "@/components/icons";
import {
  autoPrintQueueTickets,
  clampTicketCopies,
  formatTicketDateLabel,
} from "@/lib/print-bridge";

import {
  readStaffSellMode,
  writeStaffSellMode,
  type StaffSellMode,
} from "@/lib/staff-sell-mode";
import { HOTPOT_COUNTER_GROUP } from "@/lib/hotpot-counter-group";
import { StaffBranchShopShareSheet } from "@/components/staff/StaffBranchShopShareSheet";

type HomeMeta = {
  branchId?: string;
  branchName?: string;
  branchCode?: string | null;
  brand?: { code?: string | null; name?: string | null; color?: string | null };
  stockEnabled?: boolean;
  brandStockEnabled?: boolean;
  pendingOrderCount?: number;
  pendingStockCount?: number;
  todayOrderCount?: number;
  todayRevenueBaht?: number;
  canSell?: boolean;
  isOpen?: boolean;
  canToggleStore?: boolean;
  activeShift?: ActiveShiftInfo | null;
  operatingDay?: string;
  operatingMode?: string;
  weighSalesAvailable?: boolean;
  dualSellModes?: boolean;
  subscription?: {
    writeAllowed?: boolean;
    writeBlockedReason?: string | null;
  } | null;
};

type SoftTone =
  | "amber"
  | "sky"
  | "teal"
  | "rose"
  | "emerald"
  | "primary"
  | "indigo";

/** บล็อกสีทึบแบบถุงเงิน — กดง่าย อ่านใหญ่ */
const TILE_TONES: Record<
  SoftTone,
  { card: string; iconWrap: string }
> = {
  primary: {
    card: "bg-site-primary hover:bg-site-primary-hover",
    iconWrap: "bg-white/20 text-white",
  },
  amber: {
    card: "bg-amber-500 hover:bg-amber-600",
    iconWrap: "bg-white/20 text-white",
  },
  sky: {
    card: "bg-sky-500 hover:bg-sky-600",
    iconWrap: "bg-white/20 text-white",
  },
  teal: {
    card: "bg-teal-600 hover:bg-teal-700",
    iconWrap: "bg-white/20 text-white",
  },
  rose: {
    card: "bg-rose-500 hover:bg-rose-600",
    iconWrap: "bg-white/20 text-white",
  },
  emerald: {
    card: "bg-site-primary hover:bg-site-primary-hover active:bg-site-primary-active",
    iconWrap: "bg-white/20 text-white",
  },
  indigo: {
    card: "bg-indigo-600 hover:bg-indigo-700",
    iconWrap: "bg-white/20 text-white",
  },
};

function SoftTile({
  href,
  onClick,
  disabled,
  disabledHint,
  title,
  subtitle,
  icon,
  badge,
  tone = "sky",
  size = "half",
  pill,
  className: extraClassName,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledHint?: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badge?: number;
  tone?: SoftTone;
  /** hero = แถวเต็ม กว้างใหญ่ / half = ครึ่งจอ แนวตั้ง */
  size?: "hero" | "half";
  /** ป้ายมุมบนขวา เช่น ยอดนิยม */
  pill?: string;
  className?: string;
}) {
  const t = TILE_TONES[tone];
  const showSub = Boolean(subtitle) && size === "hero";
  const body =
    size === "hero" ? (
      <>
        {pill ? (
          <span className="absolute right-3 top-3 rounded-full bg-amber-300 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-950">
            {pill}
          </span>
        ) : null}
        {(badge ?? 0) > 0 ? (
          <span className="absolute right-3 top-3 flex h-7 min-w-7 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[13px] font-black text-white">
            {badge! > 99 ? "99+" : badge}
          </span>
        ) : null}
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${t.iconWrap}`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[24px] font-black leading-tight text-white">
            {title}
          </span>
          {showSub ? (
            <span className="mt-1 block truncate text-[15px] font-medium text-white/85">
              {disabled ? disabledHint || "เปิดรอบขายก่อน" : subtitle}
            </span>
          ) : null}
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <IconChevronRight size={20} />
        </span>
      </>
    ) : (
      <>
        {(badge ?? 0) > 0 ? (
          <span className="absolute right-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1 text-[12px] font-black text-white">
            {badge! > 99 ? "99+" : badge}
          </span>
        ) : pill ? (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-amber-950">
            {pill}
          </span>
        ) : null}
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.iconWrap}`}
        >
          {icon}
        </span>
        <span className="mt-auto">
          <span className="block text-[20px] font-black leading-tight text-white">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-1 block line-clamp-1 text-[13px] font-medium text-white/80">
              {disabled ? disabledHint || "เปิดรอบขายก่อน" : subtitle}
            </span>
          ) : null}
        </span>
      </>
    );

  const className =
    size === "hero"
      ? `relative flex min-h-[7.25rem] w-full flex-[1.05] items-center gap-3.5 rounded-none px-4 py-3 transition active:brightness-95 ${t.card} ${
          disabled ? "opacity-45 grayscale" : ""
        } ${extraClassName ?? ""}`
      : `relative flex h-full min-h-[8.25rem] w-full flex-col items-start gap-2 rounded-none p-4 transition active:brightness-95 ${t.card} ${
          disabled ? "opacity-45 grayscale" : ""
        } ${extraClassName ?? ""}`;

  if (disabled) {
    return (
      <div aria-disabled="true" className={className}>
        {body}
      </div>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return (
    <Link href={href || "#"} className={className}>
      {body}
    </Link>
  );
}

export default function StaffHomePage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<HomeMeta | null>(null);
  const [promoButton, setPromoButton] = useState<StaffHomePromoButton | null>(
    null,
  );
  const [shopShareOpen, setShopShareOpen] = useState(false);
  const [sellMode, setSellMode] = useState<StaffSellMode>("mala");
  const [aging, setAging] = useState<{
    critical: number;
    warn: number;
    criticalQty: number;
    warnQty: number;
    attentionCount: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("expenses") === "1") {
      router.replace("/staff/accounts?tab=expense");
    }
  }, [router]);

  const reloadMeta = async () => {
    setLoadError(null);
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch("/api/staff/branding", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      if (!res.ok) {
        setLoadError(
          res.status >= 500
            ? "เซิร์ฟเวอร์ตอบช้า — ลองใหม่อีกครั้ง"
            : "โหลดข้อมูลไม่สำเร็จ",
        );
        return;
      }
      const data = (await res.json()) as HomeMeta;
      setMeta(data);
      const defaultMode: StaffSellMode =
        data.operatingMode === "BBQ_WEIGH"
          ? "weigh"
          : data.dualSellModes
            ? readStaffSellMode("mala")
            : "mala";
      if (data.dualSellModes) {
        setSellMode(readStaffSellMode(defaultMode));
      } else if (data.weighSalesAvailable && data.operatingMode === "BBQ_WEIGH") {
        setSellMode("weigh");
      } else {
        setSellMode("mala");
      }
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      setLoadError(
        aborted
          ? "โหลดนานเกินไป — ตรวจเน็ตหรือกดลองใหม่"
          : "เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่",
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    const feedback = takeStaffOrderFeedback();
    if (!feedback) return;
    if (feedback.kind === "success") {
      toast.success(
        feedback.message,
        `${feedback.queueNumber != null ? `คิว ${formatQueueNumber(feedback.queueNumber)}` : "สร้างออเดอร์แล้ว"}${
          typeof feedback.totalAmount === "number"
            ? ` · ${formatPrice(feedback.totalAmount)}฿`
            : ""
        }`,
      );
      if (feedback.printTickets !== false) {
        autoPrintQueueTickets({
          queueNumber: feedback.queueNumber,
          orderNumber: feedback.orderNumber,
          dateLabel:
            formatTicketDateLabel(feedback.dateLabel) ||
            formatTicketDateLabel(meta?.operatingDay) ||
            formatTicketDateLabel(new Date().toISOString()),
          copies: clampTicketCopies(feedback.queueTicketCopies ?? 1),
          staffName: feedback.staffName,
          orderType: feedback.orderType,
          items: feedback.items,
          subtotal: feedback.subtotal,
          discount: feedback.discount,
          paymentMethod: feedback.paymentMethod,
          amountReceived: feedback.amountReceived,
          change: feedback.change,
          totalAmount: feedback.totalAmount,
          brandName: feedback.brandName || meta?.brand?.name || "",
          branchName: feedback.branchName || meta?.branchName || "",
          branchAddress: feedback.branchAddress || "",
        });
      }
    } else {
      toast.error("บันทึกไม่สำเร็จ", feedback.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on land after key-order
  }, []);

  useEffect(() => {
    void reloadMeta();
  }, [router]);

  useEffect(() => {
    const onReload = () => {
      void reloadMeta();
    };
    window.addEventListener("staff-branding-reload", onReload);
    return () => window.removeEventListener("staff-branding-reload", onReload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/menu?channel=storefront")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { menuItems?: MenuItemData[] } | null) => {
        if (cancelled || !data?.menuItems) return;
        setPromoButton(resolveStaffHomePromoButton(data.menuItems));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stockOn = Boolean(meta?.stockEnabled && meta?.brandStockEnabled);

  useEffect(() => {
    if (!stockOn) {
      setAging(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/stock/aging", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          attentionCount?: number;
          summary?: {
            critical?: number;
            warn?: number;
            criticalQty?: number;
            warnQty?: number;
          };
        };
        if (cancelled) return;
        setAging({
          critical: data.summary?.critical ?? 0,
          warn: data.summary?.warn ?? 0,
          criticalQty: data.summary?.criticalQty ?? 0,
          warnQty: data.summary?.warnQty ?? 0,
          attentionCount: data.attentionCount ?? 0,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockOn, meta?.activeShift?.id]);

  if (loading && !meta) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" recoveryAfterMs={8000} />
      </main>
    );
  }

  if (loadError && !meta) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-[15px] font-semibold text-slate-800">
            โหลดหน้าพนักงานไม่สำเร็จ
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void reloadMeta()}
            className="mt-6 w-full rounded-xl bg-site-primary px-4 py-3 text-sm font-semibold text-white"
          >
            ลองใหม่
          </button>
          <button
            type="button"
            onClick={() => router.replace("/staff/login")}
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
          >
            เข้าสู่ระบบใหม่
          </button>
        </div>
      </main>
    );
  }

  const hasOpenShift = Boolean(meta?.activeShift);
  const pendingOrders = meta?.pendingOrderCount ?? 0;
  const todayOrders = meta?.todayOrderCount ?? 0;
  const dual = Boolean(meta?.dualSellModes);
  const weighOnly =
    meta?.operatingMode === "BBQ_WEIGH" && Boolean(meta?.weighSalesAvailable);
  const showWeigh = weighOnly || (dual && sellMode === "weigh");
  const showMala = !weighOnly && (!dual || sellMode === "mala");
  const agingAttention = aging?.attentionCount ?? 0;
  const hasAgingAlert = agingAttention > 0;
  const writeBlocked = meta?.subscription?.writeAllowed === false;
  const writeBlockedHint =
    meta?.subscription?.writeBlockedReason ??
    "แพ็กเกจหมดอายุ — ยังดูข้อมูลได้ แต่สร้างรายการใหม่ไม่ได้";

  const switchSellMode = (mode: StaffSellMode) => {
    setSellMode(mode);
    writeStaffSellMode(mode);
  };

  return (
    <StaffAppShell active="home">
      <AddToHomeScreenBanner />
      <div
        className={`flex min-h-[calc(100dvh-11.25rem)] flex-col gap-3 px-3 pb-3 pt-3 transition-opacity ${loading ? "opacity-70" : ""}`}
      >
        {stockOn && hasAgingAlert ? (
          <Link
            href="/staff/stock/aging"
            role="alert"
            className="flex w-full shrink-0 items-center gap-3 rounded-2xl border-2 border-rose-500 bg-rose-50 px-4 py-3.5 text-left shadow-md ring-2 ring-rose-200 transition active:scale-[0.98]"
          >
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-600 text-lg font-black text-white">
              {agingAttention > 99 ? "99+" : agingAttention}
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-35" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-extrabold text-rose-950">
                ต้องตรวจคุณภาพสินค้า
              </span>
              <span className="mt-0.5 block text-[13px] font-semibold text-rose-800">
                {[
                  aging && aging.critical > 0
                    ? `แดง ${formatPrice(aging.criticalQty)} ชิ้น (${aging.critical} รายการ)`
                    : null,
                  aging && aging.warn > 0
                    ? `ส้ม ${formatPrice(aging.warnQty)} ชิ้น (${aging.warn} รายการ)`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <IconLinkSuffix size={14} className="shrink-0 text-[15px] font-extrabold text-rose-700">
              ดู
            </IconLinkSuffix>
          </Link>
        ) : null}

        {dual ? (
          <div
            className="grid shrink-0 grid-cols-2 gap-1 rounded-2xl bg-slate-200/80 p-1"
            role="tablist"
            aria-label="โหมดขาย"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sellMode === "mala"}
              onClick={() => switchSellMode("mala")}
              className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${
                sellMode === "mala"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              {HOTPOT_COUNTER_GROUP.staffMalaTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sellMode === "weigh"}
              onClick={() => switchSellMode("weigh")}
              className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${
                sellMode === "weigh"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600"
              }`}
            >
              {HOTPOT_COUNTER_GROUP.staffWeighTab}
            </button>
          </div>
        ) : null}

        {pendingOrders > 0 && showMala ? (
          <Link
            href="/staff/orders"
            className="flex w-full shrink-0 items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3.5 text-left shadow-sm transition active:scale-[0.98]"
            role="alert"
          >
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500 text-lg font-black text-white">
              {pendingOrders > 99 ? "99+" : pendingOrders}
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-40" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-extrabold text-amber-950">
                มีออเดอร์รอรับ {pendingOrders} รายการ
              </span>
              <span className="mt-0.5 block text-[13px] font-medium text-amber-800">
                กดเพื่อไปรับออเดอร์ทันที
              </span>
            </span>
            <IconLinkSuffix size={14} className="shrink-0 text-[15px] font-extrabold text-amber-700">
              ไปรับ
            </IconLinkSuffix>
          </Link>
        ) : null}

        {/* สถานะรอบขาย */}
        <section className="shrink-0 space-y-3">
          <StaffPrepTipBanner />
          {hasOpenShift ? (
            <StaffShiftControls
              variant="merchant"
              canToggleStore={Boolean(meta?.canToggleStore)}
              canSell
              activeShift={meta?.activeShift ?? null}
              todayOrderCount={todayOrders}
              todayRevenueBaht={meta?.todayRevenueBaht ?? 0}
              pendingOrderCount={pendingOrders}
              onOpened={() => {
                toast.success("เปิดรอบแล้ว", "พร้อมรับออเดอร์");
                void reloadMeta();
                window.dispatchEvent(new Event("staff-branding-reload"));
              }}
              onClosed={(msg) => {
                toast.success("ปิดรอบแล้ว", msg);
                void reloadMeta();
                window.dispatchEvent(new Event("staff-branding-reload"));
              }}
              onError={(title, detail) => toast.error(title, detail)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-center text-base font-extrabold text-slate-800">
                ยังไม่ได้เปิดรอบขาย
              </p>
              <p className="mt-1.5 text-center text-sm text-slate-500">
                เปิดรอบก่อน แล้วค่อยรับออเดอร์
              </p>
              <div className="mt-3">
                <StaffShiftControls
                  canToggleStore={Boolean(meta?.canToggleStore)}
                  canSell={false}
                  activeShift={null}
                  onOpened={() => {
                    toast.success("เปิดรอบแล้ว", "พร้อมรับออเดอร์");
                    void reloadMeta();
                    window.dispatchEvent(new Event("staff-branding-reload"));
                  }}
                  onClosed={() => {}}
                  onError={(title, detail) => toast.error(title, detail)}
                />
              </div>
            </div>
          )}
        </section>

        {/* เมนูหลัก — บล็อกสีติดกัน + เส้นแบ่งบาง */}
        <section
          className="flex min-h-0 flex-1 flex-col divide-y divide-white/40 overflow-hidden rounded-2xl shadow-md"
          aria-label="เมนูหลัก"
        >
          {showWeigh ? (
            <SoftTile
              href={hasOpenShift ? "/staff/weigh" : undefined}
              disabled={!hasOpenShift || writeBlocked}
              disabledHint={writeBlocked ? writeBlockedHint : "เปิดรอบขายก่อน"}
              title="ขายชั่งกิโล"
              subtitle={
                hasOpenShift ? "ชั่งน้ำหนัก · ปิดบิล" : "เปิดรอบขายก่อน"
              }
              icon={<IconCart size={30} />}
              tone="rose"
              size="hero"
              pill={hasOpenShift ? "ชั่งกิโล" : undefined}
            />
          ) : null}

          {showMala ? (
            <div className="flex min-h-[7.25rem] flex-[1.05] divide-x divide-white/40">
              <SoftTile
                href={hasOpenShift ? "/staff/key-order/regular" : undefined}
                disabled={!hasOpenShift || writeBlocked}
                disabledHint={writeBlocked ? writeBlockedHint : "เปิดรอบขายก่อน"}
                title="คีย์ออเดอร์"
                subtitle={
                  hasOpenShift ? "รับออเดอร์และคิดเงิน" : "เปิดรอบขายก่อน"
                }
                icon={<IconCart size={30} />}
                tone="primary"
                size="hero"
                pill={hasOpenShift ? "ใช้งานหลัก" : undefined}
                className="!w-auto min-h-[7.25rem] flex-1"
              />
              {meta?.branchId ? (
                <button
                  type="button"
                  onClick={() => setShopShareOpen(true)}
                  aria-label="QR และลิงก์หน้าร้านลูกค้า"
                  className="flex w-[5.75rem] shrink-0 flex-col items-center justify-center gap-1.5 bg-indigo-600 px-2 py-3 text-white transition hover:bg-indigo-700 active:brightness-95"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                    <IconQrCode size={26} />
                  </span>
                  <span className="text-[13px] font-extrabold leading-tight">
                    QR ร้าน
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}

          {showMala && promoButton ? (
            <SoftTile
              href={promoButton.href}
              disabled={!hasOpenShift || writeBlocked}
              disabledHint={writeBlocked ? writeBlockedHint : "เปิดรอบขายก่อน"}
              title={promoButton.label}
              subtitle={promoButton.description || "เลือกเมนูเซ็ตโปร"}
              icon={<IconStar size={28} />}
              tone="amber"
              size="hero"
            />
          ) : null}

          <div className="grid min-h-[16rem] flex-[1.35] grid-cols-2 divide-x divide-y divide-white/40">
            {showMala ? (
              <SoftTile
                href="/staff/orders"
                disabled={!hasOpenShift}
                title="ออเดอร์วันนี้"
                subtitle={
                  pendingOrders > 0
                    ? `รอรับ ${pendingOrders}`
                    : `${todayOrders} ออเดอร์`
                }
                icon={<IconClipboard size={26} />}
                badge={pendingOrders}
                tone="sky"
                size="half"
              />
            ) : (
              <SoftTile
                href={hasOpenShift ? "/staff/weigh" : undefined}
                disabled={!hasOpenShift}
                title="บิลชั่งกิโล"
                subtitle="เปิดบิล / ชั่ง"
                icon={<IconClipboard size={26} />}
                tone="sky"
                size="half"
              />
            )}
            <SoftTile
              href="/staff/summary"
              title="ภาพรวมร้าน"
              subtitle="ยอดขาย · สต๊อก · Top 10"
              icon={<IconChartBars size={26} />}
              tone="primary"
              size="half"
            />
            {stockOn ? (
              <SoftTile
                href={
                  (meta?.pendingStockCount ?? 0) > 0
                    ? "/staff/stock?action=pending"
                    : "/staff/stock"
                }
                title="สต๊อก"
                subtitle="รับของ / ตรวจนับ"
                icon={<IconBoxes size={26} />}
                badge={meta?.pendingStockCount}
                tone="teal"
                size="half"
              />
            ) : null}
            <SoftTile
              href="/staff/purchases"
              title="จัดซื้อ"
              subtitle="เอกสาร · รับเข้าสต๊อก"
              icon={<IconPackage size={26} />}
              tone="indigo"
              size="half"
              className={stockOn ? undefined : undefined}
            />
            <SoftTile
              href="/staff/accounts"
              title="บัญชี"
              subtitle="รายรับ · รายจ่าย · ภาพรวม"
              icon={<IconWallet size={26} />}
              tone="rose"
              size="half"
              className={stockOn ? "col-span-2" : undefined}
            />
          </div>
        </section>

        {shopShareOpen && meta?.branchId ? (
          <StaffBranchShopShareSheet
            branchId={meta.branchId}
            branchName={meta.branchName}
            brandCode={meta.brand?.code}
            branchCode={meta.branchCode}
            onClose={() => setShopShareOpen(false)}
          />
        ) : null}
      </div>
    </StaffAppShell>
  );
}

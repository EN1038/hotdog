"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StaffAppShell,
  StaffHomeMenuIcon,
} from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import {
  IconCamera,
  IconMoney,
  IconPackage,
  IconReceipt,
  IconStore,
} from "@/components/icons";
import { isPromoMenuItem, isMenuItemSoldOut } from "@/lib/staff-key-order";
import type { MenuItemData } from "@/lib/customer-types";
import { useToast } from "@/components/admin/Toast";
import { type ActiveShiftInfo, StaffShiftControls } from "@/components/staff/StaffShiftControls";
import { StaffShiftSummarySheet } from "@/components/staff/StaffShiftSummarySheet";
import { StaffDailySalesSummarySheet } from "@/components/staff/StaffDailySalesSummarySheet";
import { takeStaffOrderFeedback } from "@/lib/staff-order-feedback";
import { formatQueueNumber } from "@/lib/order-queue-format";
import { formatPrice } from "@/lib/constants";
import {
  autoPrintQueueTickets,
  clampTicketCopies,
  formatTicketDateLabel,
} from "@/lib/print-bridge";

type HomeMeta = {
  branchName?: string;
  brand?: { name?: string | null; color?: string | null };
  stockEnabled?: boolean;
  brandStockEnabled?: boolean;
  pendingOrderCount?: number;
  pendingStockCount?: number;
  canSell?: boolean;
  isOpen?: boolean;
  canToggleStore?: boolean;
  activeShift?: ActiveShiftInfo | null;
  operatingDay?: string;
};

function IconKey({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 7V5a4 4 0 018 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPromo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 12h6M12 9v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StaffHomePage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<HomeMeta | null>(null);
  const [promoHref, setPromoHref] = useState("/staff/key-order/promo");
  const [promoLabel, setPromoLabel] = useState("คีย์โปรโมชั่น");
  const [promoDescription, setPromoDescription] = useState("เลือกเมนูเซ็ตโปร");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [dailySalesOpen, setDailySalesOpen] = useState(false);

  const reloadMeta = async () => {
    const res = await fetch("/api/staff/branding");
    if (res.status === 401) {
      router.replace("/staff/login");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setMeta(data);
    }
    setLoading(false);
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
        const promos = data.menuItems.filter(
          (item) => isPromoMenuItem(item) && !isMenuItemSoldOut(item),
        );
        if (promos.length === 1) {
          const only = promos[0]!;
          setPromoHref(`/staff/key-order/promo/${only.id}`);
          setPromoLabel(only.name);
          setPromoDescription("คีย์โปรโมชั่น");
        } else {
          setPromoHref("/staff/key-order/promo");
          setPromoLabel("คีย์โปรโมชั่น");
          setPromoDescription("เลือกเมนูเซ็ตโปร");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  const stockOn = Boolean(meta?.stockEnabled && meta?.brandStockEnabled);
  const accent = meta?.brand?.color || "#ea580c";
  const hasOpenShift = Boolean(meta?.activeShift);

  const menuCards = [
    {
      href: "/staff/key-order/regular",
      label: "คีย์ออเดอร์",
      description: "บันทึกรายการหน้าร้าน",
      color: "#0ea5e9",
      icon: <IconKey size={24} />,
      requiresShift: true,
      kind: "key" as const,
    },
    {
      href: promoHref,
      label: promoLabel,
      description: promoDescription,
      color: "#eab308",
      icon: <IconPromo size={24} />,
      requiresShift: true,
      kind: "promo" as const,
    },
    {
      href: "/staff/orders",
      label: "ประวัติออเดอร์",
      description: "ดูออเดอร์ & จัดการคิว",
      color: accent,
      badge: meta?.pendingOrderCount,
      icon: <IconReceipt size={24} />,
      requiresShift: true,
      kind: "orders" as const,
    },
    {
      onClick: () => setSummaryOpen(true),
      label: "สรุปยอดขายตามรอบ",
      description: "ดูรายงานรายได้ประจำรอบ",
      color: "#6366f1",
      icon: <IconMoney size={24} />,
      requiresShift: false,
      kind: "summary" as const,
    },
    ...(stockOn
      ? [
          {
            onClick: () => setDailySalesOpen(true),
            label: "สรุปยอดสต๊อกและขายราย",
            description: "ดูสรุปรอบ / สร้างสรุปสิ้นวัน",
            color: "#2563eb",
            icon: <IconMoney size={24} />,
            requiresShift: false,
            kind: "daily-sales" as const,
          },
          {
            href: "/staff/stock",
            label: "สต๊อก",
            description: "รับของเข้า & ตรวจนับ",
            color: "#10b981",
            badge: meta?.pendingStockCount,
            icon: <IconPackage size={24} />,
            requiresShift: false,
            kind: "stock" as const,
          },
        ]
      : []),
  ];

  function cardEmoji(kind: string) {
    if (kind === "orders") return "📝";
    if (kind === "key") return "🛒";
    if (kind === "promo") return "🌟";
    if (kind === "summary") return "📊";
    if (kind === "daily-sales") return "💰";
    if (kind === "stock") return "📦";
    return "🔹";
  }

  return (
    <StaffAppShell active="home">
      <div className="px-4 pb-6 pt-4 space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-slate-900">เมนูด่วน</p>
            <span className="text-xs font-medium text-slate-400">เลือกงานที่ต้องการทำ</span>
          </div>
          <div className="space-y-4">
            {!hasOpenShift ? (
              <div className="relative">
                <div className="pointer-events-none space-y-4 select-none">
                  {menuCards
                    .filter((card) => card.requiresShift)
                    .map((card) => {
                      const emoji = cardEmoji(card.kind);

                      return (
                        <div
                          key={card.kind}
                          aria-disabled="true"
                          className="w-full flex items-center justify-between rounded-2xl p-6 text-white shadow-md text-left opacity-40 grayscale"
                          style={{ backgroundColor: card.color }}
                        >
                          <div>
                            <h3 className="text-2xl font-black drop-shadow-sm">{card.label}</h3>
                            <p className="mt-1 text-white/90 text-sm font-medium">เปิดรอบขายก่อน</p>
                          </div>
                          <div className="text-4xl">{emoji}</div>
                        </div>
                      );
                    })}
                </div>
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl px-5 backdrop-blur-[3px]">
                  <div className="w-full max-w-xs drop-shadow-lg">
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
              </div>
            ) : null}

            {menuCards
              .filter((card) => hasOpenShift || !card.requiresShift)
              .map((card) => {
              const description = card.description;
              const emoji = cardEmoji(card.kind);

              const isButton = Boolean(card.onClick);
              const Component = isButton ? "button" : "a";
              const props = isButton
                ? { type: "button" as const, onClick: card.onClick }
                : { href: card.href };

              return (
                <Component
                  key={card.kind}
                  {...props}
                  className="w-full flex items-center justify-between rounded-2xl p-6 text-white shadow-md active:scale-[0.98] transition-transform text-left"
                  style={{ backgroundColor: card.color }}
                >
                  <div className="min-w-0 pr-2">
                    <h3 className="truncate text-2xl font-black drop-shadow-sm">{card.label}</h3>
                    <p className="mt-1 text-white/90 text-sm font-medium">{description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {(card.badge ?? 0) > 0 && (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-900 font-black shadow-sm">
                        {card.badge! > 99 ? "99+" : card.badge}
                      </span>
                    )}
                    <div className="text-4xl">{emoji}</div>
                  </div>
                </Component>
              );
            })}
          </div>
        </section>

        {stockOn && (meta?.pendingStockCount ?? 0) > 0 ? (
          <a
            href="/staff/stock"
            className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          >
            <div>
              <p className="text-sm font-bold text-emerald-900">
                มีของรอรับจากบ้านกลาง
              </p>
              <p className="text-xs text-emerald-700">
                {meta?.pendingStockCount} รายการ — กดเพื่อยืนยันรับเข้าสาขา
              </p>
            </div>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
              รับของ
            </span>
          </a>
        ) : null}



        <StaffShiftSummarySheet
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          initialDate={meta?.operatingDay ?? ""}
        />

        <StaffDailySalesSummarySheet
          open={dailySalesOpen}
          onClose={() => setDailySalesOpen(false)}
          initialDate={meta?.operatingDay ?? ""}
        />
      </div>
    </StaffAppShell>
  );
}

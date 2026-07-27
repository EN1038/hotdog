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
import { isPromoMenuItem } from "@/lib/staff-key-order";
import type { MenuItemData } from "@/lib/customer-types";
import { useToast } from "@/components/admin/Toast";
import {
  StaffShiftControls,
  type ActiveShiftInfo,
} from "@/components/staff/StaffShiftControls";
import { StaffShiftSummarySheet } from "@/components/staff/StaffShiftSummarySheet";

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
  const [summaryOpen, setSummaryOpen] = useState(false);

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
    void reloadMeta();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/menu")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { menuItems?: MenuItemData[] } | null) => {
        if (cancelled || !data?.menuItems) return;
        const promo = data.menuItems.filter(isPromoMenuItem);
        if (promo.length === 1) {
          setPromoHref(`/staff/key-order/promo/${promo[0].id}`);
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

  const menuCards = [
    {
      href: "/staff/orders",
      label: "รับออเดอร์",
      description: "ดูออเดอร์ & จัดการคิว",
      color: accent,
      badge: meta?.pendingOrderCount,
      icon: <IconReceipt size={24} />,
    },
    {
      href: "/staff/key-order/regular",
      label: "คีย์ออเดอร์",
      description: "บันทึกรายการหน้าร้าน",
      color: "#0ea5e9",
      icon: <IconKey size={24} />,
    },
    {
      href: promoHref,
      label: "คีย์โปรโมชั่น",
      description: "เลือกเมนูเซ็ตโปร",
      color: "#eab308",
      icon: <IconPromo size={24} />,
    },
    {
      onClick: () => setSummaryOpen(true),
      label: "สรุปยอด / รอบ",
      description: "ดูรายงานรายได้ประจำรอบ",
      color: "#6366f1",
      icon: <IconMoney size={24} />,
    },
    ...(stockOn
      ? [
          {
            href: "/staff/stock",
            label: "รับของ / สต๊อก",
            description: "รับของเข้า & ตรวจนับ",
            color: "#10b981",
            badge: meta?.pendingStockCount,
            icon: <IconPackage size={24} />,
          },
        ]
      : []),
  ];

  return (
    <StaffAppShell active="home">
      <div className="px-4 pb-6 pt-4 space-y-4">
        <StaffShiftControls
          canToggleStore={Boolean(meta?.canToggleStore)}
          canSell={Boolean(meta?.canSell)}
          activeShift={meta?.activeShift ?? null}
          onOpened={() => {
            toast.success("เปิดรอบแล้ว", "พร้อมรับออเดอร์");
            void reloadMeta();
          }}
          onClosed={(msg) => {
            toast.success("ปิดรอบแล้ว", msg);
            void reloadMeta();
          }}
          onError={(title, detail) => toast.error(title, detail)}
        />

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">เมนูด่วน</p>
            <span className="text-xs font-medium text-slate-400">เลือกงานที่ต้องการทำ</span>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-3">
            {menuCards.map((card) => {
              const isButton = Boolean(card.onClick);
              const Component = isButton ? "button" : "a";
              const props = isButton
                ? { type: "button" as const, onClick: card.onClick }
                : { href: card.href };

              return (
                <Component
                  key={card.label}
                  {...props}
                  className="group relative flex flex-col justify-between rounded-2xl bg-slate-50/70 p-3.5 ring-1 ring-slate-200/80 transition hover:bg-white hover:shadow-md hover:ring-slate-300 active:scale-[0.98] text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm transition group-hover:scale-105"
                      style={{ backgroundColor: card.color }}
                    >
                      {card.icon}
                    </span>
                    {(card.badge ?? 0) > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white shadow-sm">
                        {card.badge! > 99 ? "99+" : card.badge}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-bold text-slate-900 leading-tight">
                      {card.label}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500 line-clamp-1">
                      {card.description}
                    </p>
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

        {(meta?.pendingOrderCount ?? 0) > 0 ? (
          <a
            href="/staff/orders"
            className="mt-3 flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3"
          >
            <div>
              <p className="text-sm font-bold text-orange-950">
                ออเดอร์รอรับ
              </p>
              <p className="text-xs text-orange-800">
                {meta?.pendingOrderCount} ออเดอร์ใหม่
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              เปิดคิว
            </span>
          </a>
        ) : null}

        <StaffShiftSummarySheet
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          initialDate={meta?.operatingDay ?? ""}
        />
      </div>
    </StaffAppShell>
  );
}

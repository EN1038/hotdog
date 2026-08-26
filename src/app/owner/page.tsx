"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell, useOwnerDashboard } from "@/components/owner/OwnerAppShell";
import { useToast } from "@/components/admin/Toast";
import { appAbsoluteUrl } from "@/lib/app-url";
import { bangkokDateKey, formatPrice } from "@/lib/constants";
import type {
  OwnerBranchRow,
  OwnerDashboardPayload,
} from "@/lib/owner-dashboard";
import {
  OwnerAccountCards,
  OwnerShopMenuSection,
  buildOwnerShopLinkGroups,
} from "@/components/owner/OwnerShopHub";
import {
  enterOwnerStaffMode,
  type OwnerEnterStaffBranch,
} from "@/lib/owner-enter-staff";
import { shouldPreferShopFloor } from "@/lib/owner-sole-start";
import {
  MobileDateRangeControl,
  matchMobileDatePreset,
  mobilePresetLabel,
  type MobileDatePresetId,
} from "@/components/owner/OwnerDatePresetChips";
import { OwnerBranchFilterBar } from "@/components/owner/OwnerBranchFilterBar";
import {
  OwnerWeekdayRevenueBars,
  OwnerTopSellersList,
} from "@/components/owner/OwnerOverviewExtras";
import { OwnerBranchShiftLine } from "@/components/owner/OwnerBranchShiftLine";
import { OwnerBranchClosedShiftLine } from "@/components/owner/OwnerBranchClosedShiftLine";
import { SalesShareSection } from "@/components/merchant/SalesSummaryView";
import { branchAdminBasePath } from "@/lib/branch-admin-path";
import { ownerExpensesHref, ownerSummaryHref, ownerWasteHref, ownerAgingHref, ownerCancelsHref, ownerStockFlowHref, ownerStockHistoryHref, ownerTopSellersHref, readOwnerViewRangeParams } from "@/lib/owner-view-query";

const OWNER_HOME_TAB_KEY = "skillsale_owner_home_tab_v2";

type OwnerHomeTab = "overview" | "sell" | "stock" | "setup";

const OWNER_HOME_TABS: { id: OwnerHomeTab; label: string }[] = [
  { id: "overview", label: "ภาพรวม" },
  { id: "sell", label: "การขาย" },
  { id: "stock", label: "สต๊อก" },
  { id: "setup", label: "ตั้งค่า" },
];

function readStoredHomeTab(): OwnerHomeTab | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(OWNER_HOME_TAB_KEY);
    if (raw === "more") return "setup";
    if (
      raw === "overview" ||
      raw === "sell" ||
      raw === "stock" ||
      raw === "setup"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function OwnerHomeTabBar({
  active,
  onChange,
}: {
  active: OwnerHomeTab;
  onChange: (tab: OwnerHomeTab) => void;
}) {
  return (
    <div
      className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200/80 bg-[#eef3f8]/95 px-4 py-2 backdrop-blur-md"
      role="tablist"
      aria-label="หมวดงานเจ้าของร้าน"
    >
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-200/80 p-1">
        {OWNER_HOME_TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={`rounded-xl px-1 py-2.5 text-[13px] font-extrabold transition active:scale-[0.98] sm:text-sm ${
                selected
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function customerPath(brandCode: string, branchCode: string) {
  return `/${brandCode}/${branchCode}`;
}

function IconCart({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 5h2l2.2 10.2a2 2 0 001.95 1.55H17.5a2 2 0 001.95-1.5L21 8H7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

function IconLink({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 14a5 5 0 007.07 0l2.12-2.12a5 5 0 00-7.07-7.07L11 6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M14 10a5 5 0 00-7.07 0L4.8 12.12a5 5 0 007.07 7.07L13 18"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClipboard({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 4h6a2 2 0 012 2v1h1a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h1V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M9 4.5h6v2H9v-2z" fill="currentColor" opacity="0.25" />
      <path
        d="M8 12h8M8 16h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconReceipt({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h10v18l-2-1.2L13 21l-2-1.2L9 21l-2-1.2V3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 8h6M9 12h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBoxes({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 4v16M4 8.5l8 4.5 8-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevron({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type SoftTone =
  | "amber"
  | "sky"
  | "teal"
  | "rose"
  | "emerald"
  | "primary"
  | "violet"
  | "orange"
  | "indigo";

const TILE_TONES: Record<SoftTone, { card: string; iconWrap: string }> = {
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
    card: "bg-emerald-600 hover:bg-emerald-700",
    iconWrap: "bg-white/20 text-white",
  },
  violet: {
    card: "bg-violet-600 hover:bg-violet-700",
    iconWrap: "bg-white/20 text-white",
  },
  orange: {
    card: "bg-orange-500 hover:bg-orange-600",
    iconWrap: "bg-white/20 text-white",
  },
  indigo: {
    card: "bg-indigo-600 hover:bg-indigo-700",
    iconWrap: "bg-white/20 text-white",
  },
};

/** บล็อกสีทึบแบบหน้าร้าน — กดง่าย อ่านใหญ่ */
function SoftTile({
  href,
  onClick,
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
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badge?: number;
  tone?: SoftTone;
  size?: "hero" | "half";
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
              {subtitle}
            </span>
          ) : null}
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <IconChevron size={20} />
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
              {subtitle}
            </span>
          ) : null}
        </span>
      </>
    );

  const className =
    size === "hero"
      ? `relative flex min-h-[7.25rem] w-full items-center gap-3.5 rounded-none px-4 py-3 transition active:brightness-95 ${t.card} ${
          extraClassName ?? ""
        }`
      : `relative flex h-full min-h-[8.25rem] w-full flex-col items-start gap-2 rounded-none p-4 transition active:brightness-95 ${t.card} ${
          extraClassName ?? ""
        }`;

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

function BranchLinkSheet({
  brandCode,
  branches,
  onClose,
}: {
  brandCode: string;
  branches: OwnerBranchRow[];
  onClose: () => void;
}) {
  const toast = useToast();
  const visible = branches.filter((b) => !b.isHidden && b.code);

  async function copy(branch: OwnerBranchRow) {
    if (!branch.code) return;
    const url = appAbsoluteUrl(customerPath(brandCode, branch.code));
    try {
      await navigator.clipboard.writeText(url);
      toast.success("คัดลอกลิงก์แล้ว", branch.name);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ", "ลองกดเปิดลิงก์แล้วคัดลอกจากแถบที่อยู่");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold text-slate-900">ลิงก์สั่งลูกค้า</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500"
          >
            ปิด
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          ส่งลิงก์นี้ให้ลูกค้า หรือเปิดแล้วให้สแกนจากหน้าจอ
        </p>
        <div className="space-y-2">
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              ยังไม่มีสาขาพร้อมลิงก์ลูกค้า
            </p>
          ) : (
            visible.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{branch.name}</p>
                  <p className="text-xs text-slate-500">
                    {branch.isOpen ? "เปิดอยู่" : "ปิดร้าน"}
                    {branch.isTest ? " · ทดลอง" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(branch)}
                  className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm"
                >
                  คัดลอก
                </button>
                <a
                  href={customerPath(brandCode, branch.code!)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-site-primary px-3 py-2 text-xs font-bold text-white"
                >
                  เปิด
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerHomeInner() {
  const { data, loading, reload } = useOwnerDashboard();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = bangkokDateKey();
  const initialView = readOwnerViewRangeParams(searchParams, today);
  const [linkOpen, setLinkOpen] = useState(false);
  const [homeTab, setHomeTab] = useState<OwnerHomeTab>("sell");
  const [datePreset, setDatePreset] = useState<MobileDatePresetId | null>(
    initialView.hasRange
      ? (matchMobileDatePreset(
          initialView.from,
          initialView.to,
          today,
        ) ?? "custom")
      : "today",
  );
  const [rangeFrom, setRangeFrom] = useState(initialView.from);
  const [rangeTo, setRangeTo] = useState(initialView.to);
  const [filterBranchId, setFilterBranchId] = useState<string | null>(
    initialView.branchId,
  );
  const [overviewPayload, setOverviewPayload] =
    useState<OwnerDashboardPayload | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [enteringStaff, setEnteringStaff] = useState(false);
  const [staffTargetHref, setStaffTargetHref] = useState(
    "/staff/key-order/regular",
  );
  const [staffBranches, setStaffBranches] = useState<OwnerEnterStaffBranch[] | null>(
    null,
  );
  const autoShopAttempted = useRef(false);
  const homeTabReady = useRef(false);
  const overviewTopRef = useRef<HTMLDivElement>(null);
  const urlReady = useRef(false);
  const [shopRedirecting, setShopRedirecting] = useState(false);

  useEffect(() => {
    if (homeTabReady.current) return;
    if (initialView.branchId) {
      setHomeTab("overview");
      homeTabReady.current = true;
      return;
    }
    const stored = readStoredHomeTab();
    if (stored) {
      setHomeTab(stored);
      homeTabReady.current = true;
      return;
    }
    if (!loading && data) {
      const multi =
        (data.branches ?? []).filter(
          (b) => !b.isTest && b.kind !== "WAREHOUSE",
        ).length > 1;
      setHomeTab(multi ? "overview" : "sell");
      homeTabReady.current = true;
    }
  }, [loading, data, initialView.branchId]);

  function selectHomeTab(tab: OwnerHomeTab) {
    homeTabReady.current = true;
    setHomeTab(tab);
    try {
      window.sessionStorage.setItem(OWNER_HOME_TAB_KEY, tab);
    } catch {
      /* ignore */
    }
  }

  const writeBranchQuery = useCallback(
    (branchId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (branchId) params.set("branchId", branchId);
      else params.delete("branchId");
      const q = params.toString();
      router.replace(q ? `/owner?${q}` : "/owner", { scroll: false });
    },
    [router, searchParams],
  );

  const applyBranchFilter = useCallback(
    (branchId: string | null, opts?: { scroll?: boolean }) => {
      setFilterBranchId(branchId);
      writeBranchQuery(branchId);
      if (branchId) {
        selectHomeTab("overview");
        if (opts?.scroll !== false) {
          requestAnimationFrame(() => {
            overviewTopRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }
      }
    },
    [writeBranchQuery],
  );

  useEffect(() => {
    const parsed = readOwnerViewRangeParams(searchParams, today);
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    setFilterBranchId(parsed.branchId);
    if (parsed.hasRange) {
      setRangeFrom(parsed.from);
      setRangeTo(parsed.to);
      setDatePreset(
        matchMobileDatePreset(parsed.from, parsed.to, today) ?? "custom",
      );
    }
    if (parsed.branchId) selectHomeTab("overview");
  }, [searchParams, today]);

  useEffect(() => {
    if (homeTab !== "overview") return;
    const ac = new AbortController();
    setOverviewLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          from: rangeFrom,
          to: rangeTo,
        });
        if (filterBranchId) params.set("branchId", filterBranchId);
        const res = await fetch(`/api/owner/dashboard?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok || ac.signal.aborted) return;
        const json = (await res.json()) as OwnerDashboardPayload;
        if (ac.signal.aborted) return;
        setOverviewPayload(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setOverviewLoading(false);
      }
    })();
    return () => ac.abort();
  }, [homeTab, rangeFrom, rangeTo, filterBranchId]);

  const brand = data?.brand;
  const subscription = data?.subscription ?? null;
  const pulseSource = overviewPayload ?? data;
  const branches = pulseSource?.branches ?? data?.branches ?? [];
  const liveBranches = branches.filter(
    (b) => !b.isTest && b.kind !== "WAREHOUSE",
  );
  const firstBranchId = liveBranches[0]?.id ?? branches[0]?.id ?? null;
  const openBranchCount = liveBranches.filter((b) => b.activeShift).length;

  const shellStats = data?.stats;
  const overviewStats = pulseSource?.stats ?? shellStats;
  const shellOpenCount = shellStats?.openCount ?? 0;
  const aging = pulseSource?.aging ?? data?.aging;
  const saleStockQty =
    pulseSource?.saleStockQty ?? data?.saleStockQty ?? 0;
  const saleStockValue =
    pulseSource?.saleStockValue ?? data?.saleStockValue ?? 0;
  const stockEnabled = Boolean(
    subscription?.stockEnabled ??
      pulseSource?.stockEnabled ??
      data?.stockEnabled,
  );
  const stockOn = Boolean(stockEnabled && aging?.stockActive);
  const rangeLabel = mobilePresetLabel(datePreset, rangeFrom, rangeTo);

  const overviewNetAfterWaste =
    overviewStats?.netAfterWaste ??
    (overviewStats
      ? overviewStats.netAfterExpenses - overviewStats.wasteValue
      : 0);
  const overviewCancelledCount = overviewStats?.cancelledCount ?? 0;
  const overviewCancelledRevenue = overviewStats?.cancelledRevenue ?? 0;
  const overviewCompletedRevenue = overviewStats?.completedRevenue ?? 0;
  const overviewCompletedCount = overviewStats?.completedCount ?? 0;
  const overviewOpenCount = overviewStats?.openCount ?? 0;
  const overviewWasteQty = overviewStats?.wasteQty ?? 0;
  const overviewWasteValue = overviewStats?.wasteValue ?? 0;
  const overviewExpenseTotal = overviewStats?.expenseTotal ?? 0;
  const overviewExpenseCount = overviewStats?.expenseCount ?? 0;
  const overviewCashRevenue = overviewStats?.cashRevenue ?? 0;
  const overviewTransferRevenue = overviewStats?.transferRevenue ?? 0;
  const overviewSoldQty = overviewStats?.soldQty ?? 0;
  const overviewTopSellers = (pulseSource?.topSellers ?? []).slice(0, 5);
  const overviewByFulfillment = pulseSource?.byFulfillment ?? [];
  const overviewByPayment = pulseSource?.byPayment ?? [];
  const overviewWeekdays = pulseSource?.weekdays ?? [];
  const overviewByBranchAll = useMemo(() => {
    const statsById = new Map(
      (pulseSource?.byBranch ?? []).map((row) => [row.branchId, row]),
    );

    return liveBranches
      .map((branch) => {
        const stats = statsById.get(branch.id);
        return {
          branchId: branch.id,
          branchName: branch.name,
          activeShift: branch.activeShift ?? null,
          lastClosedShift: branch.lastClosedShift ?? null,
          completedRevenue: stats?.completedRevenue ?? 0,
          completedCount: stats?.completedCount ?? 0,
          cashRevenue: stats?.cashRevenue ?? 0,
          transferRevenue: stats?.transferRevenue ?? 0,
        };
      })
      .sort((a, b) => {
        const aOpen = a.activeShift ? 1 : 0;
        const bOpen = b.activeShift ? 1 : 0;
        if (bOpen !== aOpen) return bOpen - aOpen;
        return b.completedRevenue - a.completedRevenue;
      });
  }, [pulseSource?.byBranch, liveBranches]);
  const closedBranchCount = liveBranches.length - openBranchCount;
  const overviewByBranchMore = overviewByBranchAll.length > 10;
  const overviewByBranch = overviewByBranchAll.slice(0, 10);

  const summaryHref = ownerSummaryHref({
    branchId: filterBranchId,
    from: rangeFrom,
    to: rangeTo,
  });
  const wasteHref = ownerWasteHref({
    branchId: filterBranchId,
    from: rangeFrom,
    to: rangeTo,
  });
  const expensesHref = ownerExpensesHref({
    branchId: filterBranchId,
    from: rangeFrom,
    to: rangeTo,
  });
  const agingHref = ownerAgingHref({ branchId: filterBranchId });
  const cancelsHref = ownerCancelsHref({
    branchId: filterBranchId,
    from: rangeFrom,
    to: rangeTo,
  });
  const stockFlowHref = ownerStockFlowHref({
    branchId: filterBranchId,
    from: rangeFrom,
    to: rangeTo,
  });
  const stockHistoryHref = ownerStockHistoryHref({
    branchId: filterBranchId,
    from: rangeFrom,
    to: rangeTo,
  });
  const topSellersHref = ownerTopSellersHref({
    branchId: filterBranchId,
    from: rangeFrom,
    to: rangeTo,
  });
  const branchesHref = `/owner/branches${
    rangeFrom && rangeTo
      ? `?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
      : ""
  }`;

  const shopLinkGroups = useMemo(
    () =>
      brand
        ? buildOwnerShopLinkGroups({
            brandId: brand.id,
            firstBranchId,
            stockEnabled: Boolean(
              subscription?.stockEnabled ?? data?.stockEnabled,
            ),
            kitchenEnabled: Boolean(subscription?.kitchenEnabled),
            bbqEnabled: Boolean(subscription?.bbqEnabled),
          })
        : { setup: [], stock: [], more: [] },
    [
      brand,
      firstBranchId,
      subscription?.stockEnabled,
      subscription?.kitchenEnabled,
      subscription?.bbqEnabled,
      data?.stockEnabled,
    ],
  );

  async function toggleOpen(branch: OwnerBranchRow) {
    setTogglingId(branch.id);
    try {
      const res = await fetch(`/api/admin/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen: !branch.isOpen }),
      });
      if (!res.ok) {
        toast.error("เปลี่ยนสถานะร้านไม่สำเร็จ");
        return;
      }
      toast.success(branch.isOpen ? "ปิดร้านแล้ว" : "เปิดร้านแล้ว", branch.name);
      reload();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setTogglingId(null);
    }
  }

  function scrollToBranches() {
    document
      .getElementById("owner-branch-open")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function goStaff(href: string, branchId?: string) {
    if (enteringStaff) return;
    if (href.includes("/staff/key-order") && data?.subscription?.writeAllowed === false) {
      toast.error(
        "แพ็กเกจหมดอายุ",
        data.subscription.writeBlockedReason ??
          "ยังดูข้อมูลได้ แต่สร้างรายการใหม่ไม่ได้",
      );
      return;
    }
    setEnteringStaff(true);
    setStaffTargetHref(href);
    try {
      const result = await enterOwnerStaffMode(branchId);
      if (!result.ok) {
        toast.error("เข้าหน้าร้านไม่สำเร็จ", result.error);
        return;
      }
      if ("needsBranchSelect" in result && result.needsBranchSelect) {
        setStaffBranches(result.branches);
        return;
      }
      window.location.assign(href);
    } catch {
      toast.error("เข้าหน้าร้านไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setEnteringStaff(false);
    }
  }

  async function goSell(branchId?: string) {
    await goStaff("/staff/key-order/regular", branchId);
  }

  async function goStaffStock(branchId?: string) {
    await goStaff("/staff/stock", branchId);
  }

  // แม่ค้าคนเดียว / เริ่มที่หน้าร้าน — พาเข้า staff อัตโนมัติ (ไม่ลูปหลังกดบัญชีร้าน)
  useEffect(() => {
    if (!data || loading) return;
    if (autoShopAttempted.current) return;
    if (!shouldPreferShopFloor()) return;
    const sole = Boolean(data.soleOperator);
    const prefShop =
      typeof window !== "undefined" &&
      window.localStorage.getItem("skillsale_owner_start_v1") === "shop";
    if (!sole && !prefShop) return;
    if (data.subscription?.writeAllowed === false) return;

    autoShopAttempted.current = true;
    setShopRedirecting(true);
    void (async () => {
      try {
        const result = await enterOwnerStaffMode(
          data.soleBranchId ?? undefined,
        );
        if (
          result.ok &&
          !("needsBranchSelect" in result && result.needsBranchSelect)
        ) {
          window.location.assign("/staff");
          return;
        }
      } catch {
        /* stay on owner */
      }
      setShopRedirecting(false);
    })();
  }, [data, loading]);

  if (loading && !data) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">กำลังโหลด…</p>
    );
  }

  if (shopRedirecting) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        กำลังเข้าหน้าร้าน…
      </p>
    );
  }

  const orderSubtitle =
    shellOpenCount > 0
      ? `ค้าง ${formatPrice(shellOpenCount)} · รวม ${formatPrice(shellStats?.totalOrders ?? 0)}`
      : `${formatPrice(shellStats?.totalOrders ?? 0)} ออเดอร์`;

  const multiBranch = liveBranches.length > 1;

  return (
    <div className="px-4 pb-6 pt-3">
      <OwnerHomeTabBar active={homeTab} onChange={selectHomeTab} />

      {homeTab === "overview" ? (
        <div
          ref={overviewTopRef}
          className={`space-y-3 ${overviewLoading ? "opacity-70" : ""}`}
        >
          <MobileDateRangeControl
            todayKey={today}
            from={rangeFrom}
            to={rangeTo}
            preset={datePreset}
            maxDate={today}
            onChange={({ from, to, preset }) => {
              setDatePreset(preset);
              setRangeFrom(from);
              setRangeTo(to);
            }}
            trailing={
              <OwnerBranchFilterBar
                branches={liveBranches}
                value={filterBranchId}
                onChange={(id) => applyBranchFilter(id, { scroll: false })}
              />
            }
          />

          {filterBranchId ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
              <p className="min-w-0 truncate text-[13px] font-semibold text-emerald-900">
                กำลังดู ·{" "}
                {liveBranches.find((b) => b.id === filterBranchId)?.name ??
                  "สาขา"}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={branchAdminBasePath(filterBranchId, { ownerShell: true })}
                  className="text-[12px] font-bold text-emerald-800"
                >
                  จัดการ
                </Link>
                <button
                  type="button"
                  onClick={() => applyBranchFilter(null, { scroll: false })}
                  className="rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-slate-600 ring-1 ring-slate-200"
                >
                  ทุกสาขา
                </button>
              </div>
            </div>
          ) : null}

          {/* 1) ยอดขายหลัก — แม่ค้าดูตัวเลขใหญ่ก่อน */}
          <Link
            href={summaryHref}
            className="block overflow-hidden rounded-2xl bg-emerald-700 px-4 py-4 text-white shadow-sm active:bg-emerald-800"
            aria-label="ยอดขาย"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-emerald-100">ขายได้</p>
                <p className="mt-0.5 truncate text-[12px] font-medium text-emerald-100/80">
                  {rangeLabel}
                  {filterBranchId
                    ? ` · ${
                        liveBranches.find((b) => b.id === filterBranchId)
                          ?.name ?? "สาขา"
                      }`
                    : multiBranch
                      ? ` · ${liveBranches.length} สาขา`
                      : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold text-white">
                รายละเอียด →
              </span>
            </div>
            <p className="mt-2 text-[34px] font-black tabular-nums leading-none tracking-tight">
              ฿{formatPrice(overviewCompletedRevenue)}
            </p>
            <p className="mt-2 text-[13px] font-bold text-emerald-100">
              {formatPrice(overviewCompletedCount)} บิล
              {overviewSoldQty > 0
                ? ` · ${formatPrice(overviewSoldQty)} ชิ้น`
                : ""}
              {overviewOpenCount > 0
                ? ` · ค้าง ${formatPrice(overviewOpenCount)}`
                : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/10 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-emerald-100/85">
                  เงินสด
                </p>
                <p className="mt-0.5 text-[16px] font-black tabular-nums">
                  ฿{formatPrice(overviewCashRevenue)}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-emerald-100/85">
                  โอน
                </p>
                <p className="mt-0.5 text-[16px] font-black tabular-nums">
                  ฿{formatPrice(overviewTransferRevenue)}
                </p>
              </div>
            </div>
          </Link>

          {/* 2) เหลือสุทธิ · จ่าย · เสีย */}
          <section
            className="grid grid-cols-3 gap-2"
            aria-label="สุทธิและต้นทุน"
          >
            <Link
              href={summaryHref}
              className="rounded-2xl border border-sky-200 bg-sky-50 px-2.5 py-3 active:bg-sky-100"
            >
              <p className="text-[11px] font-bold text-sky-800">เหลือสุทธิ</p>
              <p className="mt-1 text-[15px] font-black tabular-nums leading-tight text-sky-950">
                ฿{formatPrice(overviewNetAfterWaste)}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-sky-700/80">
                ขาย−จ่าย−เสีย
              </p>
            </Link>
            <Link
              href={expensesHref}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-2.5 py-3 active:bg-rose-100"
            >
              <p className="text-[11px] font-bold text-rose-800">ค่าใช้จ่าย</p>
              <p className="mt-1 text-[15px] font-black tabular-nums leading-tight text-rose-950">
                ฿{formatPrice(overviewExpenseTotal)}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-rose-700/80">
                {overviewExpenseCount > 0
                  ? `${formatPrice(overviewExpenseCount)} รายการ`
                  : "ไม่มี"}
              </p>
            </Link>
            <Link
              href={wasteHref}
              className="rounded-2xl border border-orange-200 bg-orange-50 px-2.5 py-3 active:bg-orange-100"
            >
              <p className="text-[11px] font-bold text-orange-800">ของเสีย</p>
              <p className="mt-1 text-[15px] font-black tabular-nums leading-tight text-orange-950">
                {overviewWasteQty > 0
                  ? `${formatPrice(overviewWasteQty)}`
                  : "0"}
                <span className="text-[11px] font-bold"> ชิ้น</span>
              </p>
              <p className="mt-1 text-[10px] font-semibold text-orange-700/80">
                {overviewWasteValue > 0
                  ? `฿${formatPrice(overviewWasteValue)}`
                  : "ไม่มีเสีย"}
              </p>
            </Link>
          </section>

          {/* 3) สต๊อก — สำคัญมากกับหม่าล่า */}
          {stockEnabled ? (
            <section
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              aria-label="สต๊อกปัจจุบัน"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-extrabold text-slate-800">
                    สต๊อกขายตอนนี้
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">
                    คงเหลือปัจจุบัน · วิเคราะห์ตามช่วงวันได้
                  </p>
                </div>
                <Link
                  href={stockFlowHref}
                  className="text-[12px] font-bold text-violet-700"
                >
                  วิเคราะห์ →
                </Link>
              </div>
              <div className={`grid ${stockOn ? "grid-cols-3" : "grid-cols-1"}`}>
                <Link
                  href={stockFlowHref}
                  className={`bg-violet-50 px-3 py-3 active:bg-violet-100 ${
                    stockOn ? "border-r border-slate-100" : ""
                  }`}
                >
                  <p className="text-[11px] font-bold text-violet-800">
                    เหลือขาย
                  </p>
                  <p className="mt-1 flex items-baseline gap-0.5 leading-none">
                    <span className="text-[22px] font-black tabular-nums text-violet-950">
                      {formatPrice(saleStockQty)}
                    </span>
                    <span className="text-[12px] font-bold text-violet-700">
                      ชิ้น
                    </span>
                  </p>
                  <p className="mt-1.5 text-[12px] font-bold tabular-nums text-violet-700">
                    มูลค่า ฿{formatPrice(saleStockValue)}
                  </p>
                </Link>
                {stockOn ? (
                  <>
                    <Link
                      href={agingHref}
                      className="border-r border-slate-100 bg-rose-50 px-3 py-3 active:bg-rose-100"
                    >
                      <p className="text-[11px] font-bold text-rose-800">
                        แดง · ≥{aging?.criticalDays ?? 5}วัน
                      </p>
                      <p className="mt-1 flex items-baseline gap-0.5 leading-none">
                        <span className="text-[20px] font-black tabular-nums text-rose-950">
                          {formatPrice(aging?.criticalQty ?? 0)}
                        </span>
                        <span className="text-[12px] font-bold text-rose-700">
                          ชิ้น
                        </span>
                      </p>
                      <p className="mt-1.5 text-[11px] font-semibold text-rose-700">
                        {aging?.critical ?? 0} รายการ
                      </p>
                    </Link>
                    <Link
                      href={agingHref}
                      className="bg-amber-50 px-3 py-3 active:bg-amber-100"
                    >
                      <p className="text-[11px] font-bold text-amber-900">
                        ส้ม · ≥{aging?.warnDays ?? 3}วัน
                      </p>
                      <p className="mt-1 flex items-baseline gap-0.5 leading-none">
                        <span className="text-[20px] font-black tabular-nums text-amber-950">
                          {formatPrice(aging?.warnQty ?? 0)}
                        </span>
                        <span className="text-[12px] font-bold text-amber-800">
                          ชิ้น
                        </span>
                      </p>
                      <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
                        {aging?.warn ?? 0} รายการ
                      </p>
                    </Link>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* 4) สาขา */}
          {multiBranch && !filterBranchId ? (
            <section
              className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"
              aria-label="สาขา"
            >
              <Link
                href={branchesHref}
                className="flex items-center justify-between gap-3 bg-emerald-50 px-4 py-3 active:bg-emerald-100"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-emerald-950">
                    รวม {liveBranches.length} สาขา
                  </p>
                  <p className="mt-0.5 text-[12px] font-semibold text-emerald-800/80">
                    เปิดรอบ {openBranchCount}
                    {closedBranchCount > 0
                      ? ` · ปิดรอบ ${closedBranchCount}`
                      : ""}{" "}
                    · กดสาขาเพื่อดูยอดสาขานั้น
                  </p>
                </div>
                <span className="text-lg font-bold text-emerald-700" aria-hidden>
                  ›
                </span>
              </Link>
              {overviewByBranch.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {overviewByBranch.map((row, index) => (
                    <li key={row.branchId}>
                      <button
                        type="button"
                        onClick={() => applyBranchFilter(row.branchId)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-50"
                      >
                        <span className="mt-0.5 w-5 text-[12px] font-bold tabular-nums text-slate-400">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-slate-900">
                            {row.branchName}
                          </p>
                          {row.activeShift ? (
                            <OwnerBranchShiftLine shift={row.activeShift} />
                          ) : (
                            <OwnerBranchClosedShiftLine
                              shift={row.lastClosedShift}
                            />
                          )}
                          {(row.completedCount ?? 0) > 0 ||
                          (row.completedRevenue ?? 0) > 0 ? (
                            <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
                              เงินสด ฿{formatPrice(row.cashRevenue ?? 0)}
                              {" · "}
                              โอน ฿{formatPrice(row.transferRevenue ?? 0)}
                            </p>
                          ) : !row.activeShift ? (
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                              ยังไม่มียอดในช่วงที่เลือก
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-right">
                          <span className="block text-[14px] font-black tabular-nums text-emerald-700">
                            ฿{formatPrice(row.completedRevenue)}
                          </span>
                          <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-slate-400">
                            {formatPrice(row.completedCount)} บิล
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {overviewByBranchMore ? (
                <Link
                  href={branchesHref}
                  className="flex items-center justify-center border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-[13px] font-extrabold text-emerald-800 active:bg-slate-100"
                >
                  ดูเพิ่มเติม · ทั้งหมด {overviewByBranchAll.length} สาขา →
                </Link>
              ) : overviewByBranch.length > 0 ? (
                <Link
                  href={branchesHref}
                  className="flex items-center justify-center border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[12px] font-bold text-slate-500 active:bg-slate-100"
                >
                  ดูการ์ดทุกสาขา →
                </Link>
              ) : null}
            </section>
          ) : !stockEnabled ? (
            <button
              type="button"
              onClick={() => {
                selectHomeTab("setup");
                scrollToBranches();
              }}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm active:bg-slate-50"
            >
              <div>
                <p className="text-[14px] font-extrabold text-slate-900">
                  สาขาเปิด
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  {openBranchCount}/{liveBranches.length || 0} · กดไปเปิด–ปิด
                </p>
              </div>
              <span className="text-slate-300" aria-hidden>
                ›
              </span>
            </button>
          ) : null}

          {/* 5) วิเคราะห์ */}
          <div className="space-y-3">
            <OwnerWeekdayRevenueBars
              weekdays={overviewWeekdays}
              loading={overviewLoading}
              defaultOpen={
                datePreset === "7d" ||
                datePreset === "15d" ||
                datePreset === "month" ||
                datePreset === "lastMonth" ||
                datePreset === "custom" ||
                rangeFrom !== rangeTo
              }
            />
            {overviewByFulfillment.length > 0 ? (
              <SalesShareSection
                title="ประเภทบิล"
                slices={overviewByFulfillment}
                totalRevenue={overviewCompletedRevenue}
                chartStyle="donut"
              />
            ) : null}
            {overviewByPayment.length > 0 ? (
              <SalesShareSection
                title="สัดส่วนการชำระ"
                slices={overviewByPayment}
                totalRevenue={overviewCompletedRevenue}
                chartStyle="donut"
              />
            ) : null}
          </div>

          {/* 6) เมนูขายดี */}
          <OwnerTopSellersList
            title="เมนูขายดี"
            linkLabel="วิเคราะห์ · เทียบสาขา →"
            items={overviewTopSellers}
            loading={overviewLoading}
            href={topSellersHref}
          />

          {/* 6) ยกเลิก — โชว์เมื่อมี */}
          {overviewCancelledCount > 0 ? (
            <Link
              href={cancelsHref}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 active:bg-slate-100"
            >
              <div>
                <p className="text-[14px] font-extrabold text-slate-900">
                  ยกเลิก {formatPrice(overviewCancelledCount)} บิล
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  มูลค่า ฿{formatPrice(overviewCancelledRevenue)} · กดดูเหตุผล
                </p>
              </div>
              <span className="text-slate-300" aria-hidden>
                ›
              </span>
            </Link>
          ) : null}

          {/* ทางลัด */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link
              href={summaryHref}
              className="rounded-2xl bg-emerald-600 px-3 py-3.5 text-center text-[14px] font-extrabold text-white shadow-sm active:bg-emerald-700"
            >
              สรุปยอดเต็ม
            </Link>
            <Link
              href={multiBranch ? branchesHref : "/owner/today"}
              className="rounded-2xl bg-white px-3 py-3.5 text-center text-[14px] font-extrabold text-slate-800 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
            >
              {multiBranch ? "ทุกสาขา" : "ออเดอร์วันนี้"}
            </Link>
            <Link
              href={expensesHref}
              className="rounded-2xl bg-white px-3 py-3.5 text-center text-[14px] font-extrabold text-rose-800 shadow-sm ring-1 ring-rose-200 active:bg-rose-50"
            >
              ค่าใช้จ่าย
            </Link>
            <Link
              href={wasteHref}
              className="rounded-2xl bg-white px-3 py-3.5 text-center text-[14px] font-extrabold text-orange-800 shadow-sm ring-1 ring-orange-200 active:bg-orange-50"
            >
              ของเสีย
            </Link>
          </div>
        </div>
      ) : null}

      {homeTab === "sell" ? (
        <section
          className="overflow-hidden rounded-2xl shadow-md divide-y divide-white/40"
          aria-label="การขาย"
        >
          <SoftTile
            onClick={
              data?.subscription?.writeAllowed === false
                ? undefined
                : () => void goSell()
            }
            title={enteringStaff ? "กำลังเข้า…" : "คีย์ออเดอร์"}
            subtitle={
              data?.subscription?.writeAllowed === false
                ? (data.subscription.writeBlockedReason ??
                  "แพ็กเกจหมดอายุชั่วคราว")
                : "รับออเดอร์และคิดเงิน · กลับหลังบ้านได้"
            }
            icon={<IconCart size={30} />}
            tone="primary"
            size="hero"
            pill="ใช้งานหลัก"
            className={
              enteringStaff || data?.subscription?.writeAllowed === false
                ? "pointer-events-none opacity-60"
                : undefined
            }
          />
          <SoftTile
            onClick={() => setLinkOpen(true)}
            title="ลิงก์สั่งลูกค้า"
            subtitle="ส่งลิงก์หรือเปิดหน้าให้ลูกค้าสั่ง"
            icon={<IconLink size={28} />}
            tone="amber"
            size="hero"
          />
          <div className="grid min-h-[8.25rem] grid-cols-2 divide-x divide-white/40">
            <SoftTile
              href="/owner/today"
              title="ออเดอร์วันนี้"
              subtitle={orderSubtitle}
              icon={<IconClipboard size={26} />}
              badge={shellOpenCount > 0 ? shellOpenCount : undefined}
              tone="sky"
              size="half"
            />
            <SoftTile
              href={expensesHref}
              title="ค่าใช้จ่าย"
              subtitle="ดูรายการและยอดจ่าย"
              icon={<IconReceipt size={26} />}
              tone="rose"
              size="half"
            />
          </div>
        </section>
      ) : null}

      {homeTab === "stock" ? (
        stockEnabled ? (
          <section
            className="overflow-hidden rounded-2xl shadow-md divide-y divide-white/40"
            aria-label="สต๊อก"
          >
            <SoftTile
              href={stockFlowHref}
              title="วิเคราะห์สต๊อก"
              subtitle="รับเข้า · จ่าย · ขาย · เสีย · เทียบสาขา"
              icon={<IconBoxes size={30} />}
              tone="violet"
              size="hero"
              pill="งานหลัก"
            />
            <SoftTile
              onClick={() => void goStaffStock()}
              title={enteringStaff ? "กำลังเข้า…" : "จัดการสต๊อก"}
              subtitle="รับเข้า · จ่ายออก · นับสต๊อก — มีเลขที่เอกสาร"
              icon={<IconBoxes size={28} />}
              tone="teal"
              size="hero"
            />
            <SoftTile
              href={agingHref}
              title="ค้างอายุ"
              subtitle={
                aging
                  ? `แดง ${formatPrice(aging.criticalQty ?? 0)} · ส้ม ${formatPrice(aging.warnQty ?? 0)}`
                  : "ดูของใกล้หมดอายุ"
              }
              icon={<IconClipboard size={26} />}
              tone="rose"
              size="hero"
            />
            <SoftTile
              href={wasteHref}
              title="ของเสีย"
              subtitle="ชำรุด · สูญหาย"
              icon={<IconReceipt size={26} />}
              tone="orange"
              size="hero"
            />
            <SoftTile
              href={stockHistoryHref}
              title="ประวัติ"
              subtitle="รับ · ขาย · ของเสีย · จ่ายออก"
              icon={<IconReceipt size={26} />}
              tone="indigo"
              size="hero"
            />
          </section>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm font-medium text-slate-500 shadow-sm">
            แพ็กเกจนี้ยังไม่เปิดโมดูลสต๊อก
          </p>
        )
      ) : null}

      {homeTab === "setup" ? (
        <>
          {liveBranches.length > 0 ? (
            <section id="owner-branch-open" className="scroll-mt-4">
              <div className="mb-2 flex items-end justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">
                  เปิด-ปิดร้าน
                  <span className="ml-2 text-[12px] font-semibold text-slate-500">
                    เปิด {openBranchCount} จาก {liveBranches.length} สาขา
                  </span>
                </p>
                {multiBranch ? (
                  <Link
                    href={branchesHref}
                    className="text-[12px] font-bold text-slate-500"
                  >
                    ดูยอดทุกสาขา →
                  </Link>
                ) : null}
              </div>
              <div className="space-y-2">
                {liveBranches.map((branch) => (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-semibold text-slate-900">
                        {branch.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {branch.isOpen ? "ลูกค้าเห็นว่าร้านเปิด" : "ร้านปิดอยู่"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={togglingId === branch.id}
                      onClick={() => void toggleOpen(branch)}
                      className={`h-10 min-w-[4.5rem] rounded-full px-3 text-sm font-bold text-white ${
                        branch.isOpen ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    >
                      {branch.isOpen ? "เปิด" : "ปิด"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <OwnerShopMenuSection
            links={shopLinkGroups.setup}
            title="ตั้งค่าร้าน"
            subtitle="สาขา เมนู พนักงาน และเวลาเปิด"
          />
          {/* อื่นๆ (เชื่อม LINE · ธีม) — ซ่อนไว้ก่อน ยังไม่จำเป็นตอนนี้ */}
          {brand ? (
            <OwnerAccountCards
              brandId={brand.id}
              brandName={brand.nameTh || brand.name}
              subscription={subscription}
            />
          ) : null}
        </>
      ) : null}

      {linkOpen && brand ? (
        <BranchLinkSheet
          brandCode={brand.code}
          branches={branches}
          onClose={() => setLinkOpen(false)}
        />
      ) : null}

      {staffBranches ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">
                เลือกสาขา
              </p>
              <button
                type="button"
                onClick={() => setStaffBranches(null)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500"
              >
                ปิด
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              {staffTargetHref.includes("/stock")
                ? "เข้าจัดการสต๊อกหน้าร้านด้วยบัญชีเจ้าของ — เมนูเดียวกับพนักงาน"
                : "แม่ค้าคนเดียว — เข้าหน้าร้านด้วยบัญชีเจ้าของ แล้วกลับหลังบ้านได้"}
            </p>
            <div className="space-y-2">
              {staffBranches.map((b) => (
                <button
                  key={b.branchId}
                  type="button"
                  disabled={enteringStaff}
                  onClick={() => void goStaff(staffTargetHref, b.branchId)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left active:scale-[0.99]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">
                      {b.branchName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {b.isOpen ? "เปิดอยู่" : "ปิดร้าน"}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-site-primary">
                    เข้า →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OwnerHomePage() {
  return (
    <OwnerAppShell active="home">
      <OwnerHomeInner />
    </OwnerAppShell>
  );
}

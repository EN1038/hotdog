"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { formatPrice } from "@/lib/constants";
import { formatOperatingDayLabel } from "@/lib/operating-day";
import type {
  StockAgingItem,
  StockAgingLevel,
  StockAgingSummary,
} from "@/lib/stock-aging";

type AgingPayload = {
  stockActive: boolean;
  brandName?: string;
  branchName?: string;
  warnDays: number;
  criticalDays: number;
  asOf?: string;
  summary: StockAgingSummary;
  attentionCount?: number;
  items: StockAgingItem[];
};

function levelLabel(level: StockAgingLevel) {
  switch (level) {
    case "critical":
      return "แดง · ต้องจัดการ";
    case "warn":
      return "ส้ม · ใกล้เสีย";
    case "unknown":
      return "ไม่ทราบอายุ";
    default:
      return "เขียว · ของใหม่";
  }
}

function levelCardClass(level: StockAgingLevel) {
  switch (level) {
    case "critical":
      return "border-rose-200 bg-rose-50";
    case "warn":
      return "border-orange-200 bg-orange-50";
    case "unknown":
      return "border-slate-200 bg-slate-50";
    default:
      return "border-emerald-100 bg-emerald-50/60";
  }
}

function levelTextClass(level: StockAgingLevel) {
  switch (level) {
    case "critical":
      return "text-rose-800";
    case "warn":
      return "text-orange-800";
    case "unknown":
      return "text-slate-700";
    default:
      return "text-emerald-800";
  }
}

function levelSectionTitle(
  level: StockAgingLevel,
  warnDays: number,
  criticalDays: number,
) {
  switch (level) {
    case "critical":
      return `แดง — ค้าง ≥ ${criticalDays} วัน / หมดอายุ ≤ 1 วัน`;
    case "warn":
      return `ส้ม — ค้าง ${warnDays}–${Math.max(warnDays, criticalDays - 1)} วัน · ลดราคาขายก่อน`;
    case "unknown":
      return "ยังไม่ทราบอายุ — รับเข้าครั้งหน้าให้ใส่วันหมดอายุ";
    default:
      return "เขียว — ของใหม่ · ขายปกติ";
  }
}

function formatShortDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function itemMetaLine(item: StockAgingItem) {
  const parts: string[] = [];
  if (item.ageDays != null) {
    parts.push(item.ageDays === 0 ? "รับเข้าวันนี้" : `ค้าง ${item.ageDays} วัน`);
  }
  if (item.expiresAt) {
    const d = formatShortDate(item.expiresAt);
    if (item.daysToExpiry != null) {
      if (item.daysToExpiry < 0) parts.push(`หมดอายุแล้ว (${d})`);
      else if (item.daysToExpiry === 0) parts.push(`หมดอายุวันนี้ (${d})`);
      else parts.push(`หมดอายุ ${d} (อีก ${item.daysToExpiry} วัน)`);
    } else if (d) {
      parts.push(`หมดอายุ ${d}`);
    }
  }
  if (item.oldestReceivedAt) {
    const d = formatShortDate(item.oldestReceivedAt);
    if (d) parts.push(`รับเก่าสุด ${d}`);
  }
  if (parts.length === 0) {
    return "ยังไม่มีประวัติรับเข้า — รับเข้าครั้งหน้าจะคำนวณอายุได้";
  }
  return parts.join(" · ");
}

function actionHint(level: StockAgingLevel) {
  if (level === "critical") return "แยกออก · ลดราคาแรง · หรือบันทึกของเสีย";
  if (level === "warn") return "จัดโปร / ลดราคา · ขายก่อนของใหม่";
  if (level === "unknown") return "รับเข้าพร้อมบันทึกวันที่ เพื่อติดตามอายุ";
  return "ขายตามปกติ";
}

const SECTION_ORDER: StockAgingLevel[] = [
  "critical",
  "warn",
  "unknown",
  "ok",
];

export default function StaffStockAgingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-4">
          <LoadingState className="w-full max-w-sm" />
        </main>
      }
    >
      <StaffStockAgingContent />
    </Suspense>
  );
}

function StaffStockAgingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [payload, setPayload] = useState<AgingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showOk, setShowOk] = useState(false);
  const [levelFilter, setLevelFilter] = useState<StockAgingLevel | "all">(
    "all",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promoBusyId, setPromoBusyId] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("filter");
    if (
      raw === "critical" ||
      raw === "warn" ||
      raw === "unknown" ||
      raw === "ok"
    ) {
      setLevelFilter(raw);
      if (raw === "ok") setShowOk(true);
    }
  }, [searchParams]);

  const load = useCallback(
    async (includeOk: boolean) => {
      setLoading(true);
      setError("");
      try {
        const qs = includeOk ? "?includeOk=1" : "";
        const res = await fetch(`/api/staff/stock/aging${qs}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          router.replace("/staff/login");
          return;
        }
        const data = (await res.json().catch(() => ({}))) as AgingPayload & {
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "โหลดไม่สำเร็จ");
          setPayload(null);
          return;
        }
        setPayload(data);
      } catch {
        setError("เชื่อมต่อไม่ได้");
        setPayload(null);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load(showOk);
  }, [load, showOk]);

  const grouped = useMemo(() => {
    const items = payload?.items ?? [];
    const map = new Map<StockAgingLevel, StockAgingItem[]>();
    for (const level of SECTION_ORDER) map.set(level, []);
    for (const item of items) {
      if (levelFilter !== "all" && item.level !== levelFilter) continue;
      const list = map.get(item.level) ?? [];
      list.push(item);
      map.set(item.level, list);
    }
    return SECTION_ORDER.map((level) => ({
      level,
      items: map.get(level) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [payload?.items, levelFilter]);

  function selectLevelFilter(level: StockAgingLevel | "all") {
    if (level === "ok") {
      setShowOk(true);
    }
    setLevelFilter((prev) => (prev === level ? "all" : level));
  }

  async function applyPromo(
    item: StockAgingItem,
    action: "set" | "clear",
    percent?: number,
  ) {
    if (promoBusyId) return;
    setPromoBusyId(item.id);
    try {
      const body =
        action === "clear"
          ? { action: "clear" as const }
          : {
              action: "set" as const,
              promoType: "PERCENT" as const,
              promoValue: percent ?? 20,
              note: "จัดโปรวันนี้จากหน้ารายการใกล้เสีย",
            };
      const res = await fetch(`/api/staff/menu-items/${item.id}/promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error("ตั้งโปรไม่สำเร็จ", data.error ?? "ลองใหม่");
        return;
      }
      if (action === "clear") {
        toast.success("ยกเลิกโปรแล้ว", item.name);
      } else {
        toast.success(
          percent === 50 ? "ลดครึ่งแล้ว" : `ลด ${percent ?? 20}% แล้ว`,
          `${item.name} · ใช้ได้ถึงสิ้นวัน`,
        );
      }
      await load(showOk);
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setPromoBusyId(null);
    }
  }

  if (loading && !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  const summary = payload?.summary;
  const attention =
    (summary?.critical ?? 0) + (summary?.warn ?? 0) + (summary?.unknown ?? 0);

  return (
    <StaffAppShell active="stock">
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-28 pt-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.push("/staff/stock")}
              className="text-[12px] font-semibold text-slate-500"
            >
              ← กลับสต๊อก
            </button>
            <h1 className="mt-1 text-[20px] font-black text-slate-900">
              ของค้าง / ใกล้เสีย
            </h1>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              ภาพรวมจำนวนคงเหลือตามอายุค้าง — กดดูรายการแล้วตัดสินใจเอง
              (เช็คของ · แยก · ลดราคา · บันทึกเสีย)
              {payload?.asOf
                ? ` · ${formatOperatingDayLabel(payload.asOf)}`
                : ""}
            </p>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
            <button
              type="button"
              onClick={() => void load(showOk)}
              className="mt-2 block text-[12px] font-bold underline"
            >
              ลองใหม่
            </button>
          </div>
        ) : null}

        {payload && !payload.stockActive ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600">
            สาขานี้ยังไม่เปิดระบบสต๊อก
          </div>
        ) : null}

        {summary ? (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                {
                  level: "critical" as const,
                  label: "แดง",
                  count: summary.critical,
                  qty: summary.criticalQty ?? 0,
                  activeClass: "ring-2 ring-rose-500 border-rose-400",
                  idleClass: "border-rose-200 bg-rose-50",
                  labelClass: "text-rose-600",
                  numClass: "text-rose-800",
                },
                {
                  level: "warn" as const,
                  label: "ส้ม",
                  count: summary.warn,
                  qty: summary.warnQty ?? 0,
                  activeClass: "ring-2 ring-orange-500 border-orange-400",
                  idleClass: "border-orange-200 bg-orange-50",
                  labelClass: "text-orange-600",
                  numClass: "text-orange-800",
                },
                {
                  level: "unknown" as const,
                  label: "ไม่ทราบอายุ",
                  count: summary.unknown,
                  qty: summary.unknownQty ?? 0,
                  activeClass: "ring-2 ring-slate-500 border-slate-400",
                  idleClass: "border-slate-200 bg-slate-50",
                  labelClass: "text-slate-500",
                  numClass: "text-slate-800",
                },
              ] as const
            ).map((card) => {
              const active = levelFilter === card.level;
              return (
                <button
                  key={card.level}
                  type="button"
                  onClick={() => selectLevelFilter(card.level)}
                  className={`rounded-2xl border px-2.5 py-3 text-center active:scale-[0.98] ${
                    active ? `${card.idleClass} ${card.activeClass}` : card.idleClass
                  }`}
                >
                  <p className={`text-[10px] font-semibold ${card.labelClass}`}>
                    {card.label}
                    {active ? " · กรองอยู่" : ""}
                  </p>
                  <p
                    className={`mt-0.5 text-xl font-black tabular-nums ${card.numClass}`}
                  >
                    {formatPrice(card.qty)}
                  </p>
                  <p className={`text-[10px] font-bold tabular-nums ${card.labelClass}`}>
                    {card.count === 0
                      ? "ชิ้น"
                      : `ชิ้น · ${card.count} รายการ`}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}

        {levelFilter !== "all" ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-[12px] font-semibold text-slate-700">
              กรอง:{" "}
              {levelFilter === "critical"
                ? "แดง"
                : levelFilter === "warn"
                  ? "ส้ม"
                  : levelFilter === "unknown"
                    ? "ไม่ทราบอายุ"
                    : "ของใหม่"}
            </p>
            <button
              type="button"
              onClick={() => setLevelFilter("all")}
              className="text-[12px] font-bold text-orange-700 underline"
            >
              แสดงทั้งหมด
            </button>
          </div>
        ) : null}

        {attention > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <p className="text-[12px] font-extrabold text-amber-900">
              ใช้ตัดสินใจที่หน้าร้าน
            </p>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800/90">
              ดูจำนวนที่ค้าง → เช็คของจริง / แยกของเก่า / ตามหา / ลดราคา หรือบันทึกเสีย
              — ไม่บังคับกรอกวันหมดอายุตอนรับเข้า
            </p>
            <button
              type="button"
              onClick={() =>
                router.push("/staff/stock?action=view&type=SALE_ITEM")
              }
              className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-900"
            >
              เปิดภาพรวมสต๊อกคงเหลือ
            </button>
          </div>
        ) : null}

        <p className="text-[11px] font-medium text-slate-500">
          เกณฑ์: ค้าง ≥ {payload?.warnDays ?? 3} วัน = ส้ม · ≥{" "}
          {payload?.criticalDays ?? 5} วัน หรือหมดอายุ ≤ 1 วัน = แดง
          {summary && summary.ok > 0 ? (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => {
                  setShowOk(true);
                  selectLevelFilter("ok");
                }}
                className="font-bold text-emerald-700 underline"
              >
                ของใหม่ {summary.ok} รายการ
                {summary.okQty ? ` · ${formatPrice(summary.okQty)} ชิ้น` : ""}
              </button>
            </>
          ) : null}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowOk(false);
              if (levelFilter === "ok") setLevelFilter("all");
            }}
            className={`flex-1 rounded-xl px-3 py-2.5 text-[13px] font-bold ${
              !showOk
                ? "bg-orange-600 text-white"
                : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            เฉพาะที่ต้องดูแล
          </button>
          <button
            type="button"
            onClick={() => setShowOk(true)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-[13px] font-bold ${
              showOk
                ? "bg-slate-800 text-white"
                : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            รวมของใหม่
          </button>
        </div>

        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-8 text-center">
              <p className="text-base font-extrabold text-emerald-800">
                {levelFilter !== "all"
                  ? "ไม่มีรายการในกลุ่มที่เลือก"
                  : showOk
                    ? "ยังไม่มีสต๊อกขายคงเหลือ"
                    : "ไม่มีรายการใกล้เสีย"}
              </p>
              <p className="mt-1 text-[13px] font-medium text-emerald-700/80">
                {levelFilter !== "all"
                  ? "กดการ์ดอีกครั้งหรือ「แสดงทั้งหมด」เพื่อยกเลิกกรอง"
                  : showOk
                    ? "รับเข้าเมนูขายแล้วจะแสดงที่นี่"
                    : "ของในสต๊อกยังอยู่ในเกณฑ์ปลอดภัย"}
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.level} className="space-y-2">
                <h2 className={`text-[12px] font-extrabold ${levelTextClass(group.level)}`}>
                  {levelSectionTitle(
                    group.level,
                    payload?.warnDays ?? 3,
                    payload?.criticalDays ?? 5,
                  )}
                  <span className="ml-1 font-bold tabular-nums opacity-80">
                    ({group.items.length})
                  </span>
                </h2>
                {group.items.map((item) => {
                  const open = expandedId === item.id;
                  const busy = promoBusyId === item.id;
                  const showQuick =
                    item.level === "critical" || item.level === "warn";
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border px-3.5 py-3 ${levelCardClass(item.level)}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((id) =>
                            id === item.id ? null : item.id,
                          )
                        }
                        className="w-full text-left active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={`text-[11px] font-bold ${levelTextClass(item.level)}`}
                            >
                              {levelLabel(item.level)}
                              {item.promoActive && item.promoLabel
                                ? ` · ${item.promoLabel}`
                                : ""}
                            </p>
                            <p className="mt-0.5 text-[15px] font-extrabold text-slate-900">
                              {item.name}
                            </p>
                            <p className="mt-1 text-[12px] font-medium text-slate-600">
                              คงเหลือ {formatPrice(item.quantity)} ·{" "}
                              {itemMetaLine(item)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`text-lg font-black tabular-nums ${levelTextClass(item.level)}`}
                            >
                              {formatPrice(item.quantity)}
                            </p>
                            <p className="text-[11px] font-semibold tabular-nums text-slate-500">
                              ฿{formatPrice(item.unitPrice)}
                              {item.promoActive ? "/ชิ้น" : ""}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">
                          {actionHint(item.level)}
                          {open ? "" : " · กดดูรายละเอียด"}
                        </p>
                      </button>

                      {showQuick ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void applyPromo(item, "set", 20)}
                            className="rounded-full bg-orange-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                          >
                            ขายลด 20%
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void applyPromo(item, "set", 50)}
                            className="rounded-full bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                          >
                            ลดครึ่ง
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              toast.success(
                                "จดไว้: จัดโปรวันนี้",
                                `${item.name} · ใช้ปุ่มแถมตอนขายได้`,
                              );
                            }}
                            className="rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-60"
                          >
                            แถม / จัดโปร
                          </button>
                          {item.promoActive ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void applyPromo(item, "clear")}
                              className="rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-60"
                            >
                              ยกเลิกโปร
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              router.push("/staff/stock?action=issue&type=SALE_ITEM")
                            }
                            className="rounded-full border border-rose-200 bg-rose-100/80 px-2.5 py-1.5 text-[11px] font-bold text-rose-800"
                          >
                            บันทึกเสีย
                          </button>
                        </div>
                      ) : null}

                      {open && item.layers.length > 0 ? (
                        <ul className="mt-2 space-y-1.5 border-t border-black/5 pt-2">
                          {item.layers.map((layer, idx) => (
                            <li
                              key={`${item.id}-${layer.receivedAt}-${idx}`}
                              className="flex items-center justify-between gap-2 text-[12px]"
                            >
                              <span className="font-medium text-slate-600">
                                รับ {formatShortDate(layer.receivedAt) ?? "—"} · ค้าง{" "}
                                {layer.ageDays} วัน
                              </span>
                              <span className="font-bold tabular-nums text-slate-800">
                                {formatPrice(layer.quantity)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => router.push("/staff/stock")}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[13px] font-bold text-slate-800"
          >
            ไปจัดการสต๊อก
          </button>
          <button
            type="button"
            onClick={() => router.push("/staff/summary")}
            className="rounded-2xl bg-orange-600 px-3 py-3 text-[13px] font-bold text-white"
          >
            กลับสรุปยอด
          </button>
        </div>
      </div>
    </StaffAppShell>
  );
}

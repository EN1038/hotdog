"use client";

import { formatPrice } from "@/lib/constants";
import type {
  MonthBucketInsight,
  MonthPatternResult,
  ProductPeriodInsight,
} from "@/lib/sales-month-pattern";
import {
  MONTH_PATTERN_PERIOD_OPTIONS,
  type MonthPatternPeriodDays,
} from "@/lib/sales-month-pattern-config";

export type SalesMonthPatternPayload = MonthPatternResult & {
  from: string;
  to: string;
  periodDays: MonthPatternPeriodDays;
  filterBranchId: string | null;
  productInsightsAvailable: boolean;
  productInsightHint: string | null;
};

function pctLabel(pct: number | null): string {
  if (pct == null) return "";
  if (pct > 0) return `↑ ${pct}% จากค่าเฉลี่ย`;
  if (pct < 0) return `↓ ${Math.abs(pct)}% จากค่าเฉลี่ย`;
  return "เท่ากับค่าเฉลี่ย";
}

function comparisonHint(p: ProductPeriodInsight): string | null {
  const c = p.comparison;
  if (!c) return null;
  if (c.status === "new") return "ใหม่ในช่วงนี้";
  if (c.status === "no_sales") return "ไม่มียอด";
  if (c.status === "na") return null;
  if (c.changePct == null) return null;
  return c.changePct >= 0
    ? `↑ ${c.changePct}% เทียบช่วงอื่น`
    : `↓ ${Math.abs(c.changePct)}% เทียบช่วงอื่น`;
}

function bucketTone(classification: MonthBucketInsight["classification"]): {
  border: string;
  bg: string;
  badge: string;
} {
  switch (classification) {
    case "hot":
      return {
        border: "border-emerald-200",
        bg: "bg-emerald-50/70",
        badge: "bg-emerald-100 text-emerald-900",
      };
    case "cool":
      return {
        border: "border-amber-200",
        bg: "bg-amber-50/70",
        badge: "bg-amber-100 text-amber-950",
      };
    case "normal":
      return {
        border: "border-slate-200",
        bg: "bg-slate-50/80",
        badge: "bg-slate-100 text-slate-800",
      };
    default:
      return {
        border: "border-slate-200",
        bg: "bg-white",
        badge: "bg-slate-100 text-slate-600",
      };
  }
}

function ProductList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: ProductPeriodInsight[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-2 text-[12px] font-medium text-slate-500">{emptyText}</p>
    );
  }
  return (
    <div className="mt-2">
      <p className="text-[12px] font-bold text-slate-700">{title}</p>
      <ol className="mt-1 space-y-1">
        {items.map((p, i) => {
          const hint = comparisonHint(p);
          return (
            <li
              key={p.menuItemId}
              className="flex items-start justify-between gap-2 text-[13px]"
            >
              <span className="font-semibold text-slate-900">
                {i + 1}. {p.name}
              </span>
              {hint ? (
                <span className="shrink-0 text-[11px] font-bold text-slate-500">
                  {hint}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthBucketCard({ bucket }: { bucket: MonthBucketInsight }) {
  const tone = bucketTone(bucket.classification);
  const showProducts = bucket.sufficientForClassification;

  return (
    <li
      className={`rounded-2xl border p-4 shadow-sm ${tone.border} ${tone.bg}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-extrabold text-slate-900">
            {bucket.label}
          </p>
          {bucket.sufficientForClassification ? (
            <span
              className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${tone.badge}`}
            >
              {bucket.classificationEmoji
                ? `${bucket.classificationEmoji} `
                : ""}
              {bucket.classificationLabel}
            </span>
          ) : (
            <p className="mt-1 text-[12px] font-medium text-slate-500">
              {bucket.activeDays < 2
                ? "ยังไม่มียอดพอในช่วงนี้"
                : "รอข้อมูลเพิ่มก่อนสรุป"}
            </p>
          )}
        </div>
        {bucket.activeDays > 0 ? (
          <div className="text-right">
            <p className="text-[11px] font-semibold text-slate-500">
              ยอดขายเฉลี่ย
            </p>
            <p className="text-[16px] font-black tabular-nums text-slate-900">
              ฿{formatPrice(bucket.averageDailyRevenue)}
              <span className="text-[12px] font-bold text-slate-500">/วัน</span>
            </p>
            {bucket.percentageVsStoreAverage != null &&
            bucket.sufficientForClassification ? (
              <p className="text-[11px] font-bold text-slate-600">
                {pctLabel(bucket.percentageVsStoreAverage)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {bucket.activeDays > 0 ? (
        <p className="mt-2 text-[11px] font-medium text-slate-500">
          {bucket.activeDays} วันที่มียอดขาย
          {bucket.zeroSalesDays > 0
            ? ` · ${bucket.zeroSalesDays} วันไม่มียอด (ไม่นับเป็นวันขาย 0 โดยสมมติ)`
            : ""}
        </p>
      ) : null}

      {showProducts ? (
        <>
          <ProductList
            title="สินค้าขายดีช่วงนี้"
            items={bucket.topProducts}
            emptyText="ยังไม่มีสินค้าเกรด A ในช่วงนี้"
          />
          {bucket.classification === "cool" ||
          bucket.slowProducts.length > 0 ? (
            <ProductList
              title="สินค้าขายช้า"
              items={bucket.slowProducts}
              emptyText="ยังไม่มีสินค้าเกรด C ในช่วงนี้"
            />
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function OwnerMonthPatternSection({
  data,
  loading,
  periodDays,
  onPeriodChange,
}: {
  data: SalesMonthPatternPayload | null;
  loading: boolean;
  periodDays: MonthPatternPeriodDays;
  onPeriodChange: (days: MonthPatternPeriodDays) => void;
}) {
  return (
    <section
      className={`mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
        loading ? "opacity-70" : ""
      }`}
    >
      <h2 className="text-[15px] font-extrabold text-slate-900">
        ช่วงขายดีของเดือน
      </h2>
      <p className="mt-0.5 text-[12px] font-medium text-slate-500">
        ดูว่าช่วงวันที่ 1–10, 11–15, 16–25 หรือสิ้นเดือนขายดีหรือขายน้อย
        {data?.storeAverageDailyRevenue
          ? ` · เฉลี่ยร้าน ฿${formatPrice(data.storeAverageDailyRevenue)}/วัน`
          : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {MONTH_PATTERN_PERIOD_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPeriodChange(d)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold ${
              periodDays === d
                ? "bg-emerald-700 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {d} วัน
          </button>
        ))}
      </div>

      {data?.productInsightHint ? (
        <p className="mt-2 text-[11px] font-medium text-amber-800/90">
          {data.productInsightHint}
        </p>
      ) : null}

      {!data && loading ? (
        <p className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</p>
      ) : null}

      {data && !data.sufficientData ? (
        <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-center text-[13px] font-semibold text-slate-600">
          {data.insufficientReason ??
            "ข้อมูลยังไม่พอสำหรับสรุปแนวโน้ม — ลองเลือกช่วง 90 วัน"}
        </p>
      ) : null}

      {data && data.sufficientData ? (
        <ul className="mt-4 space-y-3">
          {data.buckets.map((b) => (
            <MonthBucketCard key={b.id} bucket={b} />
          ))}
        </ul>
      ) : null}

      {data &&
      data.sufficientData &&
      !data.productInsightsAvailable ? (
        <p className="mt-3 text-[12px] font-medium text-slate-500">
          เลือกสาขาเพื่อดูสินค้าขายดี/ขายช้าในแต่ละช่วง
        </p>
      ) : null}
    </section>
  );
}

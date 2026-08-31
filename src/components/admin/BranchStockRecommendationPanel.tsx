"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MenuItemNameWithCode, MenuItemCodeBadge } from "@/components/MenuItemCodeDisplay";
import {
  AdminEmptyState,
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import {
  bangkokMonthRangeToToday,
} from "@/lib/constants";
import {
  STOCK_RECOMMEND_GRADE_LABELS,
  computeStockRecommendationKpis,
  formatStockRecommendSafetyPct,
  type StockRecommendGrade,
  type StockRecommendStatusSeverity,
  type StockRecommendationResult,
  type StockRecommendationRow,
} from "@/lib/stock-recommendation-shared";

type Props = { branchId: string };

const GRADE_TONE: Record<StockRecommendGrade, string> = {
  A: "bg-emerald-50 text-emerald-800 border-emerald-200",
  B: "bg-sky-50 text-sky-800 border-sky-200",
  C: "bg-amber-50 text-amber-800 border-amber-200",
  SKIP: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_TONE: Record<StockRecommendStatusSeverity, string> = {
  danger: "bg-red-50 text-red-800 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

function defaultSelected(rows: StockRecommendationRow[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const row of rows) {
    next[row.menuItemId] =
      (row.grade === "A" || row.grade === "B") && row.suggestedRefill > 0;
  }
  return next;
}

function ColumnHeaderWithTooltip({
  label,
  tooltip,
  align = "left",
}: {
  label: string;
  tooltip: string;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}
    >
      {label}
      <span
        title={tooltip}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold leading-none text-gray-500"
        aria-label={tooltip}
      >
        ?
      </span>
    </span>
  );
}

function KpiCard({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3">
      <p className="text-xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-600">{label}</p>
    </div>
  );
}

export function BranchStockRecommendationPanel({ branchId }: Props) {
  const toast = useToast();
  const defaults = bangkokMonthRangeToToday();

  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [coverDays, setCoverDays] = useState("5");
  const [gradeFilter, setGradeFilter] = useState<"AB" | "A" | "B" | "C" | "ALL">(
    "AB",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [data, setData] = useState<StockRecommendationResult | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cover = Number.parseInt(coverDays, 10);
      const params = new URLSearchParams({ from, to });
      if (Number.isFinite(cover) && cover >= 1 && cover <= 30) {
        params.set("coverDays", String(cover));
      }
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/recommendations?${params.toString()}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("โหลดรายงานไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        setData(null);
        return;
      }
      const payload = json as StockRecommendationResult;
      setData(payload);
      setSelected(defaultSelected(payload.items));
      const nextQty: Record<string, string> = {};
      for (const row of payload.items) {
        nextQty[row.menuItemId] = String(row.suggestedRefill);
      }
      setQtyDraft(nextQty);
    } finally {
      setLoading(false);
    }
  }, [branchId, coverDays, from, to, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((row) => {
      if (gradeFilter === "ALL") return true;
      if (gradeFilter === "AB") return row.grade === "A" || row.grade === "B";
      return row.grade === gradeFilter;
    });
  }, [data, gradeFilter]);

  const kpis = useMemo(
    () => computeStockRecommendationKpis(filteredItems),
    [filteredItems],
  );

  const selectedCheckboxCount = useMemo(
    () => filteredItems.filter((row) => selected[row.menuItemId]).length,
    [filteredItems, selected],
  );

  const reviewLines = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter((row) => selected[row.menuItemId])
      .map((row) => {
        const raw = qtyDraft[row.menuItemId] ?? String(row.suggestedRefill);
        const qty = Number.parseInt(raw, 10);
        return { row, qty: Number.isInteger(qty) && qty > 0 ? qty : 0 };
      });
  }, [data, qtyDraft, selected]);

  const reviewApplyLines = reviewLines.filter((line) => line.qty > 0);
  const reviewTotalQty = reviewApplyLines.reduce((sum, line) => sum + line.qty, 0);

  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of filteredItems) {
        next[row.menuItemId] = checked;
      }
      return next;
    });
  }

  function exportCsv() {
    const cover = Number.parseInt(coverDays, 10);
    const params = new URLSearchParams({
      from,
      to,
      format: "csv",
    });
    if (Number.isFinite(cover) && cover >= 1 && cover <= 30) {
      params.set("coverDays", String(cover));
    }
    window.open(
      `/api/admin/branches/${branchId}/stock/recommendations?${params.toString()}`,
      "_blank",
    );
  }

  function openReviewModal() {
    if (selectedCheckboxCount === 0) {
      toast.error("ยังไม่ได้เลือกรายการ", "เลือกอย่างน้อย 1 เมนู");
      return;
    }
    if (reviewApplyLines.length === 0) {
      toast.error("ไม่มีจำนวนเติม", "กรอก「ควรเติม」อย่างน้อย 1 รายการ");
      return;
    }
    setReviewOpen(true);
  }

  async function confirmApply() {
    if (reviewApplyLines.length === 0) return;

    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/recommendations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "apply_initial",
            lines: reviewApplyLines.map((line) => ({
              menuItemId: line.row.menuItemId,
              quantity: line.qty,
            })),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("รับเข้าไม่สำเร็จ", json.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(
        `รับเข้าสต๊อก ${json.applied ?? reviewApplyLines.length} รายการแล้ว`,
      );
      setReviewOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const safetyPct = data
    ? formatStockRecommendSafetyPct(data.summary.safetyFactor)
    : 20;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              แนะนำสต๊อก
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              คำนวณจากยอดขายจริง เพื่อแนะนำจำนวนสินค้าที่ควรมี ลดของขาด
              ของค้าง และของเสีย
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => exportCsv()}
              disabled={loading || !data}
            >
              Export CSV
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => openReviewModal()}
              disabled={busy || loading || selectedCheckboxCount === 0}
            >
              {busy
                ? "กำลังดำเนินการ…"
                : `สร้างรายการเติมสต๊อก (${selectedCheckboxCount})`}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={adminLabelClass}>วิเคราะห์ยอดขายตั้งแต่</label>
            <DateInput className={adminInputClass} value={from} onChange={setFrom} />
          </div>
          <div>
            <label className={adminLabelClass}>ถึงวันที่</label>
            <DateInput className={adminInputClass} value={to} onChange={setTo} />
          </div>
          <div>
            <label className={adminLabelClass}>เตรียมสต๊อกสำหรับ</label>
            <div className="relative">
              <input
                className={`${adminInputClass} pr-10`}
                type="number"
                min={1}
                max={30}
                value={coverDays}
                onChange={(e) => setCoverDays(e.target.value)}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500">
                วัน
              </span>
            </div>
          </div>
          <div>
            <label className={adminLabelClass}>เลือกกลุ่มสินค้า</label>
            <select
              className={adminInputClass}
              value={gradeFilter}
              onChange={(e) =>
                setGradeFilter(e.target.value as typeof gradeFilter)
              }
            >
              <option value="AB">ขายดี + ขายปานกลาง (A+B)</option>
              <option value="A">A ขายดี</option>
              <option value="B">B ขายปานกลาง</option>
              <option value="C">C ขายช้า</option>
              <option value="ALL">ทั้งหมด</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className={`${btnOutline} w-full`}
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "กำลังโหลด…" : "วิเคราะห์ใหม่"}
            </button>
          </div>
        </div>

        {data ? (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
            <p>
              ขายรวม{" "}
              <strong>{data.summary.totalSoldUnits.toLocaleString("th-TH")}</strong>{" "}
              ชิ้น · {data.summary.activeDays} วันที่มีขาย
            </p>
            <p>
              เตรียมขาย {data.summary.coverDays} วัน · สำรองเพิ่ม {safetyPct}%
            </p>
            <p>
              {data.summary.includesSkewerSales
                ? "รวมยอดเสียบไม้"
                : "จากออเดอร์ปกติ"}
            </p>
          </div>
        ) : null}
      </div>

      {loading ? (
        <AdminLoadingState label="กำลังวิเคราะห์ยอดขาย…" />
      ) : !data || filteredItems.length === 0 ? (
        <AdminEmptyState
          title="ไม่มีรายการตามตัวกรอง"
          description="ลองขยายช่วงวันที่ หรือเปลี่ยนกลุ่มสินค้า"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              value={kpis.analyzedCount.toLocaleString("th-TH")}
              label="เมนูที่วิเคราะห์"
            />
            <KpiCard
              value={kpis.shouldRefillCount.toLocaleString("th-TH")}
              label="เมนูที่ควรเติม"
            />
            <KpiCard
              value={kpis.totalSuggestedRefill.toLocaleString("th-TH")}
              label="ชิ้นควรเติม"
            />
            <KpiCard
              value={kpis.overstockCount.toLocaleString("th-TH")}
              label="เมนูสต๊อกเกิน"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          filteredItems.length > 0 &&
                          filteredItems.every((row) => selected[row.menuItemId])
                        }
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                        aria-label="เลือกทั้งหมด"
                      />
                    </th>
                    <th className="px-3 py-3">รหัส</th>
                    <th className="px-3 py-3">เมนู</th>
                    <th className="px-3 py-3">กลุ่ม</th>
                    <th className="px-3 py-3 text-right">ขายได้</th>
                    <th className="px-3 py-3 text-right">เฉลี่ย/วัน</th>
                    <th className="px-3 py-3 text-right">คงเหลือ</th>
                    <th className="px-3 py-3 text-right">
                      <ColumnHeaderWithTooltip
                        label="ควรมี"
                        tooltip="คำนวณจากยอดขายเฉลี่ย × จำนวนวันที่ต้องการเตรียม × สต๊อกสำรอง"
                        align="right"
                      />
                    </th>
                    <th className="px-3 py-3 text-right">
                      <ColumnHeaderWithTooltip
                        label="ควรเติม"
                        tooltip="จำนวนที่แนะนำให้เติม หลังหักสต๊อกคงเหลือปัจจุบันแล้ว"
                        align="right"
                      />
                    </th>
                    <th className="px-3 py-3">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map((row) => {
                    const isOverstock = row.status.kind === "overstock";
                    return (
                      <tr key={row.menuItemId} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2.5 align-top">
                          <input
                            type="checkbox"
                            checked={Boolean(selected[row.menuItemId])}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [row.menuItemId]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <MenuItemCodeBadge code={row.productCode} />
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-medium text-gray-900">{row.name}</p>
                          {row.category ? (
                            <p className="text-xs text-gray-500">{row.category}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${GRADE_TONE[row.grade]}`}
                          >
                            {STOCK_RECOMMEND_GRADE_LABELS[row.grade]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums align-top">
                          {row.totalSold.toLocaleString("th-TH")}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums align-top">
                          {row.avgDaily.toLocaleString("th-TH")}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums align-top">
                          {row.currentStock.toLocaleString("th-TH")}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900 align-top">
                          {row.recommendedStock.toLocaleString("th-TH")}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          <input
                            className={`${adminInputClass} w-24 text-right tabular-nums`}
                            type="number"
                            min={0}
                            value={
                              isOverstock
                                ? "0"
                                : (qtyDraft[row.menuItemId] ?? "0")
                            }
                            disabled={isOverstock}
                            onChange={(e) =>
                              setQtyDraft((prev) => ({
                                ...prev,
                                [row.menuItemId]: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[row.status.severity]}`}
                          >
                            {row.status.label}
                          </span>
                          {row.status.overstockHint ? (
                            <p className="mt-1 text-xs text-amber-700">
                              {row.status.overstockHint}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <AdminModal
        open={reviewOpen}
        onClose={() => {
          if (!busy) setReviewOpen(false);
        }}
        busy={busy}
        title="ตรวจสอบรายการเติมสต๊อก"
        description={`${reviewApplyLines.length} เมนู · รวม ${reviewTotalQty.toLocaleString("th-TH")} ชิ้น`}
        maxWidthClassName="max-w-4xl"
      >
        <div className="space-y-4 p-5">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
                <tr>
                  <th className="px-3 py-2">เมนู</th>
                  <th className="px-3 py-2 text-right">คงเหลือ</th>
                  <th className="px-3 py-2 text-right">ควรมี</th>
                  <th className="px-3 py-2 text-right">จะเติม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviewApplyLines.map(({ row, qty }) => (
                  <tr key={row.menuItemId}>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <MenuItemNameWithCode
                        name={row.name}
                        productCode={row.productCode}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.currentStock.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.recommendedStock.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                      {qty.toLocaleString("th-TH")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reviewLines.length > reviewApplyLines.length ? (
            <p className="text-xs text-gray-500">
              ข้าม {reviewLines.length - reviewApplyLines.length}{" "}
              รายการที่ไม่มีจำนวนเติม
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              className={btnOutline}
              onClick={() => setReviewOpen(false)}
              disabled={busy}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void confirmApply()}
              disabled={busy || reviewApplyLines.length === 0}
            >
              {busy ? "กำลังบันทึก…" : "ยืนยันรายการเติมสต๊อก"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

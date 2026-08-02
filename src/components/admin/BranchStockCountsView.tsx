"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { bangkokDateKey } from "@/lib/constants";

type CountLine = {
  id: string;
  systemQty: number;
  countedQty: number;
  varianceReason: string | null;
  product: {
    name: string;
    stockType: string;
    unit: string;
  };
};

type Count = {
  id: string;
  name: string;
  completedAt: string;
  note: string | null;
  createdByStaff: { name: string } | null;
  createdByAdmin: { username: string } | null;
  lines: CountLine[];
};

type FinancialData = {
  stockType?: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  cash?: number;
  transfer?: number;
  change?: number;
  customers?: number;
  lines?: Array<{ name: string; systemQty: number; countedQty: number }>;
};

const STOCK_TYPE_LABEL: Record<string, string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

function inferCountStockType(
  name: string,
  financial: FinancialData | null,
): string {
  if (
    financial?.stockType === "SALE_ITEM" ||
    financial?.stockType === "CONSUMABLE" ||
    financial?.stockType === "EQUIPMENT"
  ) {
    return financial.stockType;
  }
  if (name.includes("ของสิ้นเปลือง")) return "CONSUMABLE";
  if (name.includes("อุปกรณ์")) return "EQUIPMENT";
  return "SALE_ITEM";
}

function parseFinancial(note: string | null): FinancialData | null {
  if (!note || !note.startsWith("{")) return null;
  try {
    return JSON.parse(note) as FinancialData;
  } catch {
    return null;
  }
}

export function BranchStockCountsView({ branchId }: { branchId: string }) {
  const toast = useToast();
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateStr, setDateStr] = useState(() => bangkokDateKey());
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "ALL" | "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT"
  >("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/counts?date=${encodeURIComponent(dateStr)}`,
      );
      if (res.ok) {
        const json = await res.json();
        setCounts(json.counts || []);
        setExpandedId(null);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || err.message || "โหลดสรุปยอดไม่สำเร็จ");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [branchId, dateStr, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCounts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return counts.filter((count) => {
      const financial = parseFinancial(count.note);
      const stockType = inferCountStockType(count.name, financial);
      if (typeFilter !== "ALL" && stockType !== typeFilter) return false;
      if (!needle) return true;
      const creator =
        count.createdByStaff?.name ||
        count.createdByAdmin?.username ||
        "";
      const lineNames = (
        financial?.lines?.map((l) => l.name) ??
        count.lines.map((l) => l.product.name)
      ).join(" ");
      const hay = [
        count.name,
        creator,
        count.note ?? "",
        lineNames,
        STOCK_TYPE_LABEL[stockType] ?? "",
        String(financial?.cash ?? ""),
        String(financial?.transfer ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [counts, q, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              สรุปยอดสต๊อกและขาย
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              เลือกวันที่เพื่อดูสรุปยอดนับสต็อกทุกประเภท (เมนูขาย /
              ของสิ้นเปลือง / อุปกรณ์) และยอดเงินเมื่อเป็นเมนูขาย
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={adminLabelClass} htmlFor="stock-count-date">
              วันที่
            </label>
            <DateInput
              id="stock-count-date"
              className={adminInputClass}
              value={dateStr}
              max={bangkokDateKey()}
              onChange={(v) => {
                if (v) setDateStr(v);
              }}
            />
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="stock-count-type">
              ประเภท
            </label>
            <select
              id="stock-count-type"
              className={adminInputClass}
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(
                  e.target.value as
                    | "ALL"
                    | "SALE_ITEM"
                    | "CONSUMABLE"
                    | "EQUIPMENT",
                )
              }
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="SALE_ITEM">เมนูขาย</option>
              <option value="CONSUMABLE">ของสิ้นเปลือง</option>
              <option value="EQUIPMENT">อุปกรณ์</option>
            </select>
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="stock-count-q">
              ค้นหา
            </label>
            <input
              id="stock-count-q"
              type="search"
              className={adminInputClass}
              placeholder="ชื่อสรุป, ผู้บันทึก, ชื่อรายการ…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <AdminLoadingState className="py-8" />
      ) : filteredCounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            {counts.length === 0
              ? "ไม่มีสรุปยอดสต๊อกในวันที่เลือก"
              : `ไม่พบรายการที่ตรงกับ “${q.trim()}”`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mb-2 text-sm font-semibold text-slate-600">
            พบ {filteredCounts.length} ครั้ง
            {q.trim() && counts.length !== filteredCounts.length
              ? ` จากทั้งหมด ${counts.length}`
              : ""}{" "}
            ในวันนี้
          </div>
          {filteredCounts.map((count) => {
            const isExpanded = expandedId === count.id;
            const time = new Date(count.completedAt).toLocaleTimeString(
              "th-TH",
              {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Bangkok",
              },
            );
            const creator =
              count.createdByStaff?.name ||
              count.createdByAdmin?.username ||
              "ไม่ทราบชื่อ";
            const financialData = parseFinancial(count.note);
            const stockType = inferCountStockType(count.name, financialData);
            const typeLabel = STOCK_TYPE_LABEL[stockType] ?? "เมนูขาย";
            const includesSales = stockType === "SALE_ITEM";

            const displayLines: Array<{
              id: string;
              name: string;
              systemQty: number;
              countedQty: number;
            }> =
              financialData?.lines && financialData.lines.length > 0
                ? financialData.lines.map((l, i) => ({
                    id: `note-${i}`,
                    name: l.name,
                    systemQty: l.systemQty,
                    countedQty: l.countedQty,
                  }))
                : count.lines
                    .filter((l) =>
                      includesSales
                        ? l.product.stockType === "SALE_ITEM"
                        : l.product.stockType === stockType,
                    )
                    .map((l) => ({
                      id: l.id,
                      name: l.product.name,
                      systemQty: l.systemQty,
                      countedQty: l.countedQty ?? 0,
                    }));

            const mismatchCount = displayLines.filter(
              (l) => l.countedQty !== l.systemQty,
            ).length;

            return (
              <div
                key={count.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : count.id)
                  }
                  className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-slate-50"
                >
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {count.name || `สรุปยอดเวลา ${time} น.`}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {typeLabel} • ทำรายการโดย: {creator} • เวลา: {time} น.
                      {mismatchCount > 0
                        ? ` • ยอดไม่ตรง ${mismatchCount} รายการ`
                        : ""}
                    </p>
                  </div>
                  <div className="text-slate-400">
                    {isExpanded ? "▲" : "▼"}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-5">
                    {financialData && includesSales ? (
                      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">
                            เงินสด
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-900">
                            ฿
                            {(financialData.cash ?? 0).toLocaleString("th-TH")}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">
                            เงินโอน
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-900">
                            ฿
                            {(financialData.transfer ?? 0).toLocaleString(
                              "th-TH",
                            )}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">
                            เงินทอน
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-900">
                            ฿
                            {(financialData.change ?? 0).toLocaleString(
                              "th-TH",
                            )}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">
                            จำนวนลูกค้า (คิว)
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-900">
                            {(financialData.customers ?? 0).toLocaleString(
                              "th-TH",
                            )}
                          </p>
                        </div>
                        <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-site-primary-soft p-4 md:col-span-4">
                          <p className="font-bold text-site-primary-focus">
                            รวมยอดเงินทั้งหมด (สด + โอน)
                          </p>
                          <p className="text-xl font-black text-site-primary-focus">
                            ฿
                            {(
                              (financialData.cash || 0) +
                              (financialData.transfer || 0)
                            ).toLocaleString("th-TH")}
                          </p>
                        </div>
                      </div>
                    ) : financialData && !includesSales ? (
                      <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                        สรุปยอดสต๊อก · {typeLabel} (ไม่บันทึกยอดเงินขาย)
                      </div>
                    ) : count.note ? (
                      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-800">
                          หมายเหตุ: {count.note}
                        </p>
                      </div>
                    ) : null}

                    {mismatchCount > 0 ? (
                      <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                        พบ {mismatchCount} รายการที่ยอดนับได้ไม่ตรงสต๊อกปัจจุบัน
                        (ตอนบันทึก)
                      </p>
                    ) : null}

                    <div>
                      <h4 className="mb-3 border-b border-slate-200 pb-2 font-bold text-slate-900">
                        รายละเอียดการนับสต็อก ({typeLabel})
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="pb-2 font-semibold">ชื่อรายการ</th>
                              <th className="pb-2 text-right font-semibold">
                                ปัจจุบัน
                              </th>
                              <th className="pb-2 text-right font-semibold">
                                นับได้
                              </th>
                              <th className="pb-2 text-right font-semibold">
                                ผลต่าง
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {displayLines.map((line) => {
                              const diff = line.countedQty - line.systemQty;
                              const isDiff = diff !== 0;
                              const diffSign = diff > 0 ? "+" : "";
                              return (
                                <tr
                                  key={line.id}
                                  className={
                                    isDiff
                                      ? "bg-red-50/80"
                                      : "hover:bg-slate-100/50"
                                  }
                                >
                                  <td
                                    className={`py-3 font-semibold ${
                                      isDiff
                                        ? "text-red-800"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {line.name}
                                  </td>
                                  <td
                                    className={`py-3 text-right ${
                                      isDiff
                                        ? "font-semibold text-red-700"
                                        : "text-slate-600"
                                    }`}
                                  >
                                    {line.systemQty}
                                  </td>
                                  <td
                                    className={`py-3 text-right font-bold ${
                                      isDiff
                                        ? "text-red-800"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {line.countedQty}
                                  </td>
                                  <td
                                    className={`py-3 text-right font-bold ${
                                      isDiff
                                        ? "text-red-700"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {diffSign}
                                    {diff}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLoadingState } from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";

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

export function BranchStockCountsView({ branchId }: { branchId: string }) {
  const toast = useToast();
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Default to today
  const [dateStr, setDateStr] = useState(() => {
    const today = new Date();
    // Get YYYY-MM-DD in local time
    const offset = today.getTimezoneOffset();
    const local = new Date(today.getTime() - offset * 60 * 1000);
    return local.toISOString().split("T")[0];
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/stock/counts?date=${dateStr}`);
      if (res.ok) {
        const json = await res.json();
        setCounts(json.counts || []);
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to load stock counts");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [branchId, dateStr, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">ประวัติการตรวจนับสต๊อก</h2>
          <p className="text-xs text-slate-500 mt-0.5">เลือกวันที่เพื่อดูข้อมูลการนับสต๊อกและยอดสรุปของสาขา</p>
        </div>
        
        <div>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 focus:border-site-primary focus:ring-1 focus:ring-site-primary"
          />
        </div>
      </div>

      {loading ? (
        <AdminLoadingState className="py-8" />
      ) : counts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">ไม่มีประวัติการนับสต๊อกในวันที่เลือก</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm font-semibold text-slate-600 mb-2">
            พบการทำรายการทั้งหมด {counts.length} ครั้งในวันนี้
          </div>
          {counts.map((count) => {
            const isExpanded = expandedId === count.id;
            const time = new Date(count.completedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
            const creator = count.createdByStaff?.name || count.createdByAdmin?.username || "ไม่ทราบชื่อ";
            
            
            // Try parse note to see if it's the financial JSON
            let financialData: {
              cash?: number;
              transfer?: number;
              change?: number;
              customers?: number;
              lines?: Array<{ name: string; systemQty: number; countedQty: number }>;
            } | null = null;
            if (count.note && count.note.startsWith("{")) {
              try {
                financialData = JSON.parse(count.note);
              } catch {
                // ignore
              }
            }

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
                    .filter((l) => l.product.stockType === "SALE_ITEM")
                    .map((l) => ({
                      id: l.id,
                      name: l.product.name,
                      systemQty: l.systemQty,
                      countedQty: l.countedQty,
                    }));

            return (
              <div key={count.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : count.id)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <h3 className="font-bold text-slate-900">{count.name || `ตรวจนับสต๊อกเวลา ${time} น.`}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">ทำรายการโดย: {creator} • เวลา: {time} น.</p>
                  </div>
                  <div className="text-slate-400">
                    {isExpanded ? "▲" : "▼"}
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50">
                    {financialData ? (
                      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">เงินสด</p>
                          <p className="text-lg font-black text-slate-900 mt-1">฿{financialData.cash?.toLocaleString() ?? 0}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">เงินโอน</p>
                          <p className="text-lg font-black text-slate-900 mt-1">฿{financialData.transfer?.toLocaleString() ?? 0}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">เงินทอน</p>
                          <p className="text-lg font-black text-slate-900 mt-1">฿{financialData.change?.toLocaleString() ?? 0}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold text-slate-500">จำนวนลูกค้า (คิว)</p>
                          <p className="text-lg font-black text-slate-900 mt-1">{financialData.customers?.toLocaleString() ?? 0}</p>
                        </div>
                        <div className="col-span-2 md:col-span-4 rounded-xl border border-slate-200 bg-site-primary-soft p-4 flex items-center justify-between">
                          <p className="font-bold text-site-primary-focus">รวมยอดเงินทั้งหมด (สด + โอน)</p>
                          <p className="text-xl font-black text-site-primary-focus">฿{((financialData.cash || 0) + (financialData.transfer || 0)).toLocaleString()}</p>
                        </div>
                      </div>
                    ) : count.note ? (
                      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-800">หมายเหตุ: {count.note}</p>
                      </div>
                    ) : null}

                    <div>
                      <h4 className="font-bold text-slate-900 mb-3 border-b border-slate-200 pb-2">รายละเอียดการตรวจนับ (เมนูขาย)</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="pb-2 font-semibold">ชื่อรายการ</th>
                              <th className="pb-2 font-semibold text-right">ยอดระบบ</th>
                              <th className="pb-2 font-semibold text-right">ยอดนับจริง</th>
                              <th className="pb-2 font-semibold text-right">ผลต่าง</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {displayLines.map((line) => {
                              const diff = line.countedQty - line.systemQty;
                              const diffClass = diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold";
                              const diffSign = diff > 0 ? "+" : "";
                              return (
                                <tr key={line.id} className="hover:bg-slate-100/50">
                                  <td className="py-3 font-semibold text-slate-900">
                                    {line.name}
                                  </td>
                                  <td className="py-3 text-right text-slate-600">
                                    {line.systemQty}
                                  </td>
                                  <td className="py-3 text-right font-bold text-slate-900">
                                    {line.countedQty}
                                  </td>
                                  <td className={`py-3 text-right ${diffClass}`}>
                                    {diffSign}{diff}
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

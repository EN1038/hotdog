"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { bangkokDateKey, formatPrice } from "@/lib/constants";

type UsageItem = {
  id: string;
  name: string;
  unit: string;
  stockType: string;
  unitPrice: number;
  openingQty: number;
  stockInQty: number;
  issuedQty: number;
  adjustQty: number;
  closingQty: number;
  usedQty: number;
  usedCostBaht: number;
};

type UsageTotals = {
  stockInQty: number;
  issuedQty: number;
  usedQty: number;
  usedCostBaht: number;
  openingQty: number;
  closingQty: number;
};

type StockTypeFilter = "CONSUMABLE" | "EQUIPMENT";

function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return bangkokDateKey(d);
}

export function BranchStockUsageView({ branchId }: { branchId: string }) {
  const toast = useToast();
  const today = bangkokDateKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [stockType, setStockType] = useState<StockTypeFilter>("CONSUMABLE");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UsageItem[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [formula, setFormula] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from,
        to,
        stockType,
      });
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/usage?${params}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "โหลดสรุปการใช้ไม่สำเร็จ");
        setItems([]);
        setTotals(null);
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
      setTotals(json.totals ?? null);
      setFormula(typeof json.formula === "string" ? json.formula : "");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setItems([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to, stockType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.unit.toLowerCase().includes(needle),
    );
  }, [items, q]);

  const typeLabel =
    stockType === "CONSUMABLE" ? "ของสิ้นเปลือง" : "อุปกรณ์";

  function setPreset(days: number) {
    if (days <= 1) {
      setFrom(today);
      setTo(today);
      return;
    }
    setFrom(addDaysToDateKey(today, -(days - 1)));
    setTo(today);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-extrabold text-slate-900">
            สรุปการใช้{typeLabel}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ดูว่าใช้ไปเท่าไรและต้นทุนประมาณเท่าไรในช่วงวันที่เลือก — เช่น แก้วกี่ใบ
            แก๊สกี่ถัง น้ำแข็งกี่กระสอบ
          </p>
          {formula ? (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {formula}
            </p>
          ) : null}
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreset(1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => setPreset(7)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            7 วัน
          </button>
          <button
            type="button"
            onClick={() => setPreset(30)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            30 วัน
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={adminLabelClass} htmlFor="usage-from">
              วันที่เริ่ม
            </label>
            <DateInput
              id="usage-from"
              className={adminInputClass}
              value={from}
              max={to}
              onChange={(v) => {
                if (v) setFrom(v);
              }}
            />
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="usage-to">
              วันที่สิ้นสุด
            </label>
            <DateInput
              id="usage-to"
              className={adminInputClass}
              value={to}
              min={from}
              max={today}
              onChange={(v) => {
                if (v) setTo(v);
              }}
            />
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="usage-type">
              ประเภท
            </label>
            <select
              id="usage-type"
              className={adminInputClass}
              value={stockType}
              onChange={(e) =>
                setStockType(e.target.value as StockTypeFilter)
              }
            >
              <option value="CONSUMABLE">ของสิ้นเปลือง</option>
              <option value="EQUIPMENT">อุปกรณ์</option>
            </select>
          </div>
          <div>
            <label className={adminLabelClass} htmlFor="usage-q">
              ค้นหา
            </label>
            <input
              id="usage-q"
              type="search"
              className={adminInputClass}
              placeholder="ชื่อรายการ หรือหน่วย…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <AdminLoadingState className="py-8" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            {items.length === 0
              ? `ยังไม่มีรายการ${typeLabel} หรือยังไม่มีข้อมูลในช่วงนี้`
              : `ไม่พบรายการที่ตรงกับ “${q.trim()}”`}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            ให้หน้าร้านรับเข้าเมื่อของมา + สรุปยอด{typeLabel}ท้ายวัน
            แล้วรายงานนี้จะคำนวณการใช้ได้
          </p>
        </div>
      ) : (
        <>
          {totals ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">รับเข้า</p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                  {totals.stockInQty.toLocaleString("th-TH")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">
                  ใช้ไป (คำนวณ)
                </p>
                <p className="mt-1 text-xl font-black tabular-nums text-amber-700">
                  {totals.usedQty.toLocaleString("th-TH")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">
                  จ่ายออก (บันทึก)
                </p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                  {totals.issuedQty.toLocaleString("th-TH")}
                </p>
              </div>
              <div className="rounded-2xl border border-site-primary/20 bg-site-primary-soft p-4 shadow-sm">
                <p className="text-xs font-semibold text-site-primary-focus">
                  ต้นทุนใช้ไปโดยประมาณ
                </p>
                <p className="mt-1 text-xl font-black tabular-nums text-site-primary-focus">
                  ฿{formatPrice(totals.usedCostBaht)}
                </p>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">
              พบ {filtered.length} รายการ
              {from === to ? ` · วันที่ ${from}` : ` · ${from} ถึง ${to}`}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="px-4 py-3 font-semibold">รายการ</th>
                    <th className="px-3 py-3 text-right font-semibold">ต้นงวด</th>
                    <th className="px-3 py-3 text-right font-semibold">รับเข้า</th>
                    <th className="px-3 py-3 text-right font-semibold">ใช้ไป</th>
                    <th className="px-3 py-3 text-right font-semibold">ปลายงวด</th>
                    <th className="px-3 py-3 text-right font-semibold">
                      จ่ายออก
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      ปรับยอด
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      ต้นทุนใช้ไป
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          หน่วย: {item.unit}
                          {item.unitPrice > 0
                            ? ` · ฿${formatPrice(item.unitPrice)}/${item.unit}`
                            : " · ยังไม่ตั้งราคา"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                        {item.openingQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-700">
                        {item.stockInQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-black text-amber-700">
                        {item.usedQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                        {item.closingQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                        {item.issuedQty.toLocaleString("th-TH")}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums ${
                          item.adjustQty < 0
                            ? "text-red-600"
                            : item.adjustQty > 0
                              ? "text-emerald-700"
                              : "text-slate-500"
                        }`}
                      >
                        {item.adjustQty > 0 ? "+" : ""}
                        {item.adjustQty.toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                        {item.unitPrice > 0
                          ? `฿${formatPrice(item.usedCostBaht)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              ตั้งราคาต่อหน่วยตอนสร้าง/แก้ไขรายการ{typeLabel}
              เพื่อให้คำนวณต้นทุนได้ · น้ำจิ้มใช้หน่วย “แกลลอน”
              แล้วสรุปยอดท้ายวันสม่ำเสมอ
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/constants";
import type { WarehouseStockFlow } from "@/lib/warehouse-stock-flow";

function qty(n: number) {
  return formatPrice(n);
}

function ShowSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        checked ? "bg-site-primary" : "bg-slate-300"
      }`}
    >
      <span
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
        style={{ left: checked ? "1.65rem" : "0.2rem" }}
      />
    </button>
  );
}

function CheckStep({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "sky" | "amber";
}) {
  const tones = {
    slate: "bg-slate-800 text-white",
    sky: "bg-sky-700 text-white",
    amber: "bg-amber-500 text-amber-950",
  };
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p
        className={`mt-1 rounded-xl px-2 py-2 text-[18px] font-black tabular-nums leading-none ${tones[tone]}`}
      >
        {qty(value)}
      </p>
    </div>
  );
}

export function WarehouseStockFlowCard({
  data,
  branchName,
}: {
  data: WarehouseStockFlow;
  branchName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!data.enabled) return null;

  const priorPending = Math.max(0, data.pendingNowQty - data.pendingQty);
  const gapAbs = Math.abs(data.gapQty);
  const status = data.balanced
    ? {
        text: "ตรงกัน — ส่งคลัง = รับสาขา + รอรับ",
        className: "border-emerald-200 bg-emerald-50 text-emerald-900",
      }
    : data.gapQty > 0
      ? {
          text: `ขาด ${qty(gapAbs)} ชิ้น — สาขารับน้อยกว่าที่คลังส่ง`,
          className: "border-rose-200 bg-rose-50 text-rose-900",
        }
      : {
          text: `รับเกิน ${qty(gapAbs)} ชิ้น — สาขารับมากกว่าที่คลังส่ง`,
          className: "border-amber-200 bg-amber-50 text-amber-950",
        };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/60 shadow-sm">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700/80">
            สต๊อกกลาง · แยกจากสาขาขาย
          </p>
          <h2 className="mt-0.5 text-[16px] font-extrabold text-slate-900">
            {data.warehouseName}
          </h2>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
            {open
              ? branchName
                ? `เทียบนำส่งกับสาขา ${branchName}`
                : "รับเข้าคลัง · นำส่งสาขา · คงเหลือคลัง"
              : `เหลือ ${qty(data.onHandQty)} · ส่ง ${qty(data.sentQty)} · รับ ${qty(data.receivedQty)} · รอ ${qty(data.pendingQty)}`}
            {open && data.issueMode === "TRANSFER" ? " · โหมดรอรับที่สาขา" : ""}
            {open && data.issueMode === "ISSUE" ? " · โหมดจ่ายเข้าสาขาทันที" : ""}
          </p>
        </div>
        <ShowSwitch
          checked={open}
          onChange={setOpen}
          label="แสดงสต๊อกกลาง"
        />
      </div>

      {open ? (
        <>
      <div className="grid grid-cols-3 gap-2 px-4">
        <div className="rounded-xl border border-sky-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-bold text-sky-700">รับเข้าคลัง</p>
          <p className="mt-1 text-[18px] font-black tabular-nums leading-none text-slate-900">
            {qty(data.receiveQty)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-sky-700">
            ช่วงที่เลือก
            {data.receiveValue > 0 ? ` · ฿${qty(data.receiveValue)}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-bold text-indigo-700">คงเหลือคลัง</p>
          <p className="mt-1 text-[18px] font-black tabular-nums leading-none text-slate-900">
            {qty(data.onHandQty)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-indigo-700">
            ปัจจุบัน
            {data.onHandValue > 0 ? ` · ฿${qty(data.onHandValue)}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-bold text-orange-700">เสียที่คลัง</p>
          <p className="mt-1 text-[18px] font-black tabular-nums leading-none text-slate-900">
            {qty(data.wasteQty)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-orange-700">
            ชำรุด/สูญหาย
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="mb-2 text-[12px] font-extrabold text-slate-800">
          ตรวจยอดนำส่งสาขา
        </p>
        <div className="flex items-center gap-1.5">
          <CheckStep label="ส่งคลัง" value={data.sentQty} tone="slate" />
          <span className="shrink-0 pt-4 text-[12px] font-black text-slate-400">
            ↔
          </span>
          <CheckStep label="รับสาขา" value={data.receivedQty} tone="sky" />
          <span className="shrink-0 pt-4 text-[12px] font-black text-slate-400">
            ↔
          </span>
          <CheckStep label="รอรับ" value={data.pendingQty} tone="amber" />
        </div>
        <p
          className={`mt-2 rounded-xl border px-3 py-2 text-[12px] font-bold ${status.className}`}
        >
          {status.text}
        </p>
        {priorPending > 0 ? (
          <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
            มีรอรับค้างจากช่วงก่อนหน้าอีก {qty(priorPending)} ชิ้น (รวมตอนนี้{" "}
            {qty(data.pendingNowQty)})
          </p>
        ) : null}
      </div>

      {data.branches.length > 0 ? (
        <ul className="border-t border-indigo-100 bg-white/80 px-4 py-2">
          {data.branches.map((b) => (
            <li
              key={b.branchId}
              className="flex items-baseline justify-between gap-2 border-b border-slate-50 py-2 last:border-b-0"
            >
              <p className="min-w-0 truncate text-[13px] font-bold text-slate-800">
                {b.branchName}
              </p>
              <p className="shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                ส่ง {qty(b.sentQty)} · รับ {qty(b.receivedQty)} · รอ{" "}
                {qty(b.pendingQty)}
                {b.gapQty !== 0
                  ? b.gapQty > 0
                    ? ` · ขาด ${qty(b.gapQty)}`
                    : ` · เกิน ${qty(Math.abs(b.gapQty))}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-indigo-100 px-4 py-3 text-[12px] font-medium text-slate-500">
          ช่วงนี้ยังไม่มีรายการนำส่งสาขา
        </p>
      )}
        </>
      ) : null}
    </section>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ZoomableImage } from "@/components/ZoomableImage";
import { OwnerWasteSummaryList } from "@/components/owner/OwnerOverviewExtras";
import { ShareExportMenu, type ShareExportAction } from "@/components/staff/ShareExportMenu";
import { formatPrice } from "@/lib/constants";
import {
  captureElementToPng,
  copyTextToClipboard,
  downloadPngDataUrl,
  sharePngDataUrl,
} from "@/lib/share-media";
import { parseMovementImages } from "@/lib/stock-movement-images";
import type {
  SalesReportWasteEntry,
  SalesReportWasteItem,
} from "@/lib/sales-report-shared";

export type WasteViewMode = "cards" | "list";

type BranchOpt = { id: string; name: string };

type Props = {
  items: SalesReportWasteItem[];
  wasteQty: number;
  wasteValue: number;
  loading?: boolean;
  /** สาขาที่เปรียบเทียบได้ (เมื่อยังไม่กรองสาขาเดียว) */
  compareBranches?: BranchOpt[];
  /** เช่น 01/08/2569 – 21/08/2569 */
  rangeLabel?: string;
  brandName?: string;
};

function wasteTypeLabel(type: string) {
  if (type === "DAMAGE") return "ชำรุด";
  if (type === "LOST") return "สูญหาย";
  if (type === "ISSUE") return "จ่ายออกจากสต๊อก";
  return type;
}

function formatWasteAt(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function qtyForBranch(item: SalesReportWasteItem, branchId: string) {
  return item.byBranch?.find((b) => b.branchId === branchId)?.quantity ?? 0;
}

function valueForBranch(item: SalesReportWasteItem, branchId: string) {
  return item.byBranch?.find((b) => b.branchId === branchId)?.value ?? 0;
}

function EntryDetail({ entry }: { entry: SalesReportWasteEntry }) {
  const photos = parseMovementImages(entry.imageUrl);
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-500">
            {formatWasteAt(entry.createdAt)}
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-slate-600">
            {entry.branchName ? `${entry.branchName} · ` : ""}
            {entry.createdByName ?? "ไม่ระบุผู้บันทึก"} ·{" "}
            {wasteTypeLabel(entry.type)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black tabular-nums text-orange-800">
            {formatPrice(entry.quantity)}
          </p>
          <p className="text-[11px] font-medium tabular-nums text-slate-500">
            ฿{formatPrice(entry.value)}
          </p>
        </div>
      </div>
      {entry.note ? (
        <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[13px] font-medium text-slate-800">
          {entry.note}
        </p>
      ) : (
        <p className="mt-2 text-[12px] font-medium text-slate-400">
          ไม่มีรายละเอียดบันทึก
        </p>
      )}
      {photos.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((src) => (
            <ZoomableImage
              key={src}
              src={src}
              alt="รูปประกอบของเสีย"
              className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200"
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function WasteItemDetailSheet({
  item,
  onClose,
}: {
  item: SalesReportWasteItem;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="ปิด"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold text-slate-900">
              {item.name}
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-slate-500">
              ของเสีย {formatPrice(item.quantity)} ชิ้น · ฿
              {formatPrice(item.value)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500"
          >
            ปิด
          </button>
        </div>

        {item.byBranch && item.byBranch.length > 1 ? (
          <div className="mt-3 rounded-2xl bg-orange-50 px-3 py-2.5">
            <p className="mb-1.5 text-[12px] font-bold text-orange-900">
              แยกตามสาขา
            </p>
            <ul className="space-y-1">
              {item.byBranch.map((b) => (
                <li
                  key={b.branchId}
                  className="flex items-baseline justify-between gap-2 text-[13px]"
                >
                  <span className="truncate font-medium text-slate-700">
                    {b.branchName}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-orange-950">
                    {formatPrice(b.quantity)} · ฿{formatPrice(b.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mb-1.5 mt-4 text-xs font-semibold text-slate-700">
          รายการบันทึก ({item.entries.length})
        </p>
        <ul className="space-y-2 pb-2">
          {item.entries.map((entry) => (
            <EntryDetail key={entry.id} entry={entry} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function OwnerWasteAnalytics({
  items,
  wasteQty,
  wasteValue,
  loading,
  compareBranches = [],
  rangeLabel = "",
  brandName = "",
}: Props) {
  const [view, setView] = useState<WasteViewMode>("cards");
  const [compareOpen, setCompareOpen] = useState(false);
  const [selected, setSelected] = useState<SalesReportWasteItem | null>(null);
  const [shareBusy, setShareBusy] = useState<ShareExportAction | null>(null);
  const [shareMsg, setShareMsg] = useState("");
  const compareCaptureRef = useRef<HTMLDivElement>(null);

  const showCompare = compareBranches.length > 1;
  const compareRows = useMemo(() => items.slice(0, 30), [items]);

  const stamp = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
    } catch {
      return "";
    }
  }, [items, compareBranches]);

  function buildCompareCopyText() {
    const lines: string[] = [];
    lines.push("ของเสียเทียบสาขา");
    if (brandName) lines.push(brandName);
    if (rangeLabel) lines.push(`ช่วง ${rangeLabel}`);
    lines.push(
      `รวม ${formatPrice(wasteQty)} ชิ้น · ฿${formatPrice(wasteValue)}`,
    );
    lines.push(compareBranches.map((b) => b.name).join(" · "));
    lines.push("");
    const header = ["สินค้า", ...compareBranches.map((b) => b.name), "รวม"].join(
      "\t",
    );
    lines.push(header);
    for (const item of compareRows) {
      const cols = [
        item.name,
        ...compareBranches.map((b) => {
          const qty = qtyForBranch(item, b.id);
          return qty > 0 ? String(qty) : "—";
        }),
        String(item.quantity),
      ];
      lines.push(cols.join("\t"));
    }
    return lines.join("\n");
  }

  async function ensureCompareVisible() {
    if (compareOpen) return;
    flushSync(() => setCompareOpen(true));
    await new Promise((r) => setTimeout(r, 80));
  }

  async function captureComparePng() {
    await ensureCompareVisible();
    const node = compareCaptureRef.current;
    if (!node) throw new Error("ไม่พบตารางเทียบสาขา");
    return captureElementToPng(node);
  }

  function compareFilename() {
    const day = new Date().toISOString().slice(0, 10);
    return `waste-branch-compare-${day}.png`;
  }

  async function handleShareImage() {
    if (shareBusy || compareRows.length === 0) return;
    setShareBusy("share");
    setShareMsg("");
    try {
      const dataUrl = await captureComparePng();
      const title = ["ของเสียเทียบสาขา", brandName, rangeLabel]
        .filter(Boolean)
        .join(" · ");
      const r = await sharePngDataUrl(dataUrl, compareFilename(), title);
      if (r.error === "cancelled") {
        setShareMsg("");
        return;
      }
      setShareMsg(
        r.mode === "share"
          ? "แชร์รูปแล้ว"
          : r.ok
            ? "อุปกรณ์นี้แชร์ไม่ได้ — บันทึกรูปแทนแล้ว"
            : r.error ?? "แชร์รูปไม่สำเร็จ",
      );
    } catch {
      setShareMsg("แชร์รูปไม่สำเร็จ");
    } finally {
      setShareBusy(null);
    }
  }

  async function handleSaveImage() {
    if (shareBusy || compareRows.length === 0) return;
    setShareBusy("save");
    setShareMsg("");
    try {
      const dataUrl = await captureComparePng();
      const r = await downloadPngDataUrl(dataUrl, compareFilename());
      setShareMsg(r.ok ? "บันทึกรูปแล้ว" : r.error ?? "บันทึกรูปไม่สำเร็จ");
    } catch {
      setShareMsg("บันทึกรูปไม่สำเร็จ");
    } finally {
      setShareBusy(null);
    }
  }

  async function handleCopyText() {
    if (shareBusy || compareRows.length === 0) return;
    setShareBusy("copy");
    setShareMsg("");
    try {
      const ok = await copyTextToClipboard(buildCompareCopyText());
      setShareMsg(
        ok ? "คัดลอกข้อความแล้ว — ไปวางในไลน์ได้เลย" : "คัดลอกไม่สำเร็จ",
      );
    } catch {
      setShareMsg("คัดลอกไม่สำเร็จ");
    } finally {
      setShareBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
        {(
          [
            { id: "cards" as const, label: "การ์ดเหตุผล" },
            { id: "list" as const, label: "ลิสต์จำนวน" },
          ] as const
        ).map((opt) => {
          const active = view === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setView(opt.id)}
              className={`flex-1 rounded-xl py-2.5 text-[13px] font-extrabold ${
                active
                  ? "bg-orange-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {showCompare ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-slate-900">
                ของเสียเทียบสาขา
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                {compareOpen
                  ? "ชิ้นของเสียต่อสาขา · กดตัวเลขดูรายละเอียด"
                  : "เปิดเพื่อเทียบจำนวนของเสียแต่ละสาขา"}
              </p>
              {shareMsg ? (
                <p className="mt-1 text-[12px] font-semibold text-emerald-700">
                  {shareMsg}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ShareExportMenu
                busy={shareBusy}
                message={shareMsg}
                disabled={loading || compareRows.length === 0}
                onShareImage={handleShareImage}
                onSaveImage={handleSaveImage}
                onCopyText={handleCopyText}
              />
              <button
                type="button"
                role="switch"
                aria-checked={compareOpen}
                aria-label="แสดงของเสียเทียบสาขา"
                onClick={() => setCompareOpen((v) => !v)}
                className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                  compareOpen ? "bg-orange-600" : "bg-slate-300"
                }`}
              >
                <span
                  className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
                  style={{ left: compareOpen ? "1.65rem" : "0.2rem" }}
                />
              </button>
            </div>
          </div>
          {compareOpen ? (
            <div className="overflow-x-auto border-t border-slate-100">
              <div
                ref={compareCaptureRef}
                className="w-max min-w-full bg-white px-3 py-3"
              >
                <div className="mb-2 border-b border-slate-100 pb-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <p className="text-[13px] font-extrabold text-slate-900">
                      ของเสียเทียบสาขา
                    </p>
                    <p className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                      {stamp}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {[
                      brandName || null,
                      rangeLabel ? `ช่วง ${rangeLabel}` : null,
                      `รวม ${formatPrice(wasteQty)} ชิ้น · ฿${formatPrice(wasteValue)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {compareBranches.map((b) => b.name).join(" · ")}
                  </p>
                </div>
                <table className="min-w-full text-left text-[12px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="sticky left-0 bg-slate-50 px-3 py-2 font-bold">
                        สินค้า
                      </th>
                      {compareBranches.map((b) => (
                        <th
                          key={b.id}
                          className="max-w-[5.5rem] truncate px-2 py-2 font-bold"
                          title={b.name}
                        >
                          {b.name}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-bold">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={compareBranches.length + 2}
                          className="px-3 py-8 text-center text-slate-400"
                        >
                          {loading ? "กำลังโหลด…" : "ยังไม่มีของเสีย"}
                        </td>
                      </tr>
                    ) : (
                      compareRows.map((item) => (
                        <tr
                          key={item.menuItemId}
                          className="border-t border-slate-50"
                        >
                          <td className="sticky left-0 max-w-[7rem] truncate bg-white px-3 py-2 font-semibold text-slate-900">
                            {item.name}
                          </td>
                          {compareBranches.map((b) => {
                            const qty = qtyForBranch(item, b.id);
                            const max = Math.max(
                              1,
                              ...compareBranches.map((x) =>
                                qtyForBranch(item, x.id),
                              ),
                            );
                            const hot = qty === max && qty > 0;
                            return (
                              <td key={b.id} className="px-2 py-2">
                                {qty > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelected(item)}
                                    className={`tabular-nums underline-offset-2 hover:underline ${
                                      hot
                                        ? "font-black text-orange-700"
                                        : "font-semibold text-slate-600"
                                    }`}
                                    title={`฿${formatPrice(valueForBranch(item, b.id))}`}
                                  >
                                    {formatPrice(qty)}
                                  </button>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setSelected(item)}
                              className="font-black tabular-nums text-slate-900 underline-offset-2 hover:underline"
                            >
                              {formatPrice(item.quantity)}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "cards" ? (
        <OwnerWasteSummaryList
          items={items}
          wasteQty={wasteQty}
          wasteValue={wasteValue}
          loading={loading}
          defaultOpen={false}
        />
      ) : (
        <section
          className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
            loading ? "opacity-60" : ""
          }`}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[15px] font-extrabold text-slate-900">
              ลิสต์ของเสีย
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              แบบรายการสต๊อก · กดจำนวนเพื่อดูเหตุผลและรูป
            </p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              ไม่มีรายการของเสียในช่วงนี้
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item, index) => {
                const branchHint =
                  item.byBranch && item.byBranch.length > 1
                    ? `${item.byBranch.length} สาขา`
                    : item.byBranch?.[0]?.branchName ?? null;
                return (
                  <li key={item.menuItemId}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 shrink-0 text-center text-[12px] font-bold tabular-nums text-slate-400">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                          {item.entries.length} ครั้ง
                          {branchHint ? ` · ${branchHint}` : ""}
                          {" · "}฿{formatPrice(item.value)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="shrink-0 rounded-xl bg-orange-50 px-3 py-2 text-right ring-1 ring-orange-100 active:bg-orange-100"
                        aria-label={`ดูรายละเอียดของเสีย ${item.name}`}
                      >
                        <p className="text-[17px] font-black tabular-nums leading-none text-orange-900">
                          {formatPrice(item.quantity)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-bold text-orange-700/80">
                          กดดู
                        </p>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {selected ? (
        <WasteItemDetailSheet
          item={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

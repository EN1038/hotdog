import { bangkokDateKey } from "@/lib/constants";
import { parseBranchMenuOrderNote } from "@/lib/branch-menu-order-note";

/** Extract stock-count display name from Convert / apply history notes. */
export function parseConvertSummaryNameFromNote(
  note: string | null | undefined,
): string | null {
  if (!note?.trim()) return null;
  const markers = [
    "Convert จากสรุปยอด · ",
    "Convert จากเอกสารยอดนับ · ",
    "แอดมินปรับจากเอกสารยอดนับ · ",
    "ปรับจากเอกสารยอดนับ · ",
  ];
  for (const marker of markers) {
    const idx = note.indexOf(marker);
    if (idx < 0) continue;
    const name = note
      .slice(idx + marker.length)
      .replace(/\(นับได้\s*-?\d+\)/g, "")
      .trim();
    return name || null;
  }
  return null;
}

export function isConvertStyleHistoryNote(
  note: string | null | undefined,
): boolean {
  return Boolean(parseConvertSummaryNameFromNote(note));
}

/** Staff deep-link to open a stock summary sheet. */
export function staffStockSummaryHref(opts: {
  summaryId?: string | null;
  date?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("focus", "convert");
  if (opts.summaryId?.trim()) qs.set("summaryId", opts.summaryId.trim());
  if (opts.date?.trim()) qs.set("date", opts.date.trim());
  return `/staff/stock?${qs.toString()}`;
}

/** Staff deep-link to stock history, optionally open one ADJUST bill. */
export function staffStockHistoryHref(opts: {
  batchId?: string | null;
  kind?: "all" | "adjust" | "sale" | "in" | "out" | "waste";
  from?: string | null;
  to?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("action", "history");
  if (opts.kind && opts.kind !== "all") qs.set("kind", opts.kind);
  if (opts.from?.trim()) qs.set("from", opts.from.trim());
  if (opts.to?.trim()) qs.set("to", opts.to.trim());
  if (opts.batchId?.trim()) qs.set("batchId", opts.batchId.trim());
  return `/staff/stock?${qs.toString()}`;
}

export function staffHistoryHrefForSummary(opts: {
  summaryId: string;
  completedAt?: string | null;
}): string {
  const day = opts.completedAt ? bangkokDateKey(new Date(opts.completedAt)) : null;
  return staffStockHistoryHref({
    batchId: opts.summaryId,
    kind: "adjust",
    from: day,
    to: day,
  });
}

export function orderIdFromHistoryNote(
  note: string | null | undefined,
): string | null {
  return parseBranchMenuOrderNote(note)?.orderId ?? null;
}

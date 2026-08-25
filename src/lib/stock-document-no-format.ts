/** Client-safe helpers for stock document numbers (no DB). */

export type StockDocumentKind = "IN" | "OUT";

export function normalizeBranchCode(
  code: string | null | undefined,
  fallbackId: string,
): string {
  const raw = code?.trim();
  if (raw) {
    return raw.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 32);
  }
  return fallbackId.slice(-8);
}

/** Bangkok wall-clock minute key: YYYYMMDDHHmm */
export function bangkokMinuteKey(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${pick("year")}${pick("month")}${pick("day")}${pick("hour")}${pick("minute")}`;
}

export function documentNoPrefix(
  kind: StockDocumentKind,
  branchCode: string,
  minuteKey: string,
): string {
  return `${kind}-${branchCode}-${minuteKey}`;
}

/** Instant default while server assigns the next running number. */
export function provisionalStockDocumentNo(input: {
  kind: StockDocumentKind;
  branchCode?: string | null;
  branchId?: string;
}): string {
  const branchCode = normalizeBranchCode(
    input.branchCode,
    input.branchId ?? "branch",
  );
  const prefix = documentNoPrefix(input.kind, branchCode, bangkokMinuteKey());
  return `${prefix}-001`;
}

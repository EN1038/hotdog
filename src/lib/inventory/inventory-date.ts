import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";
import { INVENTORY_DEFAULTS } from "@/lib/inventory/inventory-config";

/** Add calendar days to a Bangkok date key (`YYYY-MM-DD`). */
export function addBangkokDays(dateKey: string, delta: number): string {
  const base = new Date(`${dateKey}T12:00:00+07:00`);
  base.setTime(base.getTime() + delta * 86_400_000);
  return bangkokDateKey(base);
}

/** 0 = Sunday … 6 = Saturday in Asia/Bangkok. */
export function bangkokWeekdayIndex(dateKey: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  });
  const weekday = formatter.format(new Date(`${dateKey}T12:00:00+07:00`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function bangkokWeekdayLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
  }).format(new Date(`${dateKey}T12:00:00+07:00`));
}

/** Inclusive list of date keys from `from` to `to`. */
export function dateKeyRange(from: string, to: string): string[] {
  const keys: string[] = [];
  let cur = from;
  while (cur <= to) {
    keys.push(cur);
    if (cur === to) break;
    cur = addBangkokDays(cur, 1);
  }
  return keys;
}

export function tomorrowBangkokDateKey(today = bangkokDateKey()): string {
  return addBangkokDays(today, 1);
}

/** Default analysis window ending today. */
export function defaultInventoryAnalysisRange(to = bangkokDateKey()) {
  return {
    from: addBangkokDays(to, -(INVENTORY_DEFAULTS.analysisWindowDays - 1)),
    to,
  };
}

export function parseInventoryAnalysisRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  fallbackTo = bangkokDateKey(),
): { from: string; to: string } | null {
  const to = toRaw?.trim() || fallbackTo;
  const from =
    fromRaw?.trim() ||
    addBangkokDays(to, -(INVENTORY_DEFAULTS.analysisWindowDays - 1));
  if (!isBangkokDateKey(from) || !isBangkokDateKey(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Bangkok date + time, e.g. `30/08/2569 16:05 น.` */
export function formatBangkokDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const date = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
    const time = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(d);
    return `${date} ${time} น.`;
  } catch {
    return "";
  }
}

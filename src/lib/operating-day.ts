import {
  bangkokDateKey,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";

export function addDaysToDateKey(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return bangkokDateKey(start);
}

/** Bangkok calendar date key (YYYY-MM-DD). */
export function resolveCalendarDayKey(at: Date = new Date()): string {
  return bangkokDateKey(at);
}

export function calendarDayDate(at: Date = new Date()): Date {
  return queueBusinessDateFromKey(resolveCalendarDayKey(at));
}

/** @deprecated Use resolveCalendarDayKey / calendarDayDate */
export const resolveOperatingDayKey = (
  at: Date = new Date(),
  _cutoffTime?: string | null,
) => resolveCalendarDayKey(at);

/** @deprecated Use calendarDayDate */
export const operatingDayDate = (
  at: Date = new Date(),
  _cutoffTime?: string | null,
) => calendarDayDate(at);

export function formatOperatingDayLabel(dateYmd: string): string {
  if (!isBangkokDateKey(dateYmd)) return dateYmd;
  try {
    return new Date(`${dateYmd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateYmd;
  }
}

export function formatOperatingDayShort(dateYmd: string): string {
  if (!isBangkokDateKey(dateYmd)) return dateYmd;
  try {
    return new Date(`${dateYmd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateYmd;
  }
}

/** Simple day status for list APIs (calendar Bangkok, no cutoff). */
export function getCalendarDayState(at: Date = new Date()) {
  const operatingDay = resolveCalendarDayKey(at);
  return {
    operatingDay,
    cutoffTime: "00:00",
    lateEntryUntilTime: null as string | null,
    entryLocked: false,
    entryDeadlineAt: null as Date | null,
    entryDeadlineHm: "00:00",
    minutesRemaining: 24 * 60,
    tone: "ok" as const,
  };
}

/** @deprecated Use getCalendarDayState */
export const getOperatingDayState = (
  _branch?: unknown,
  at: Date = new Date(),
) => getCalendarDayState(at);

/** @deprecated Use getCalendarDayState */
export const getOperatingRoundStatus = (
  _branch?: unknown,
  at: Date = new Date(),
) => getCalendarDayState(at);

export function formatMinutesRemainingTh(minutes: number): string {
  if (minutes <= 0) return "หมดเวลาแล้ว";
  if (minutes < 60) return `เหลือ ${minutes} นาที`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `เหลือ ${h} ชม.`;
  return `เหลือ ${h} ชม. ${m} นาที`;
}

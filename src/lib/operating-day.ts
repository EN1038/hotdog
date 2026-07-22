import {
  bangkokDateKey,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_BUSINESS_DAY_CUTOFF = "00:00";

export function isHhmm(value: string | null | undefined): value is string {
  return Boolean(value && HHMM.test(value));
}

export function normalizeCutoffTime(
  value: string | null | undefined,
): string {
  return isHhmm(value) ? value : DEFAULT_BUSINESS_DAY_CUTOFF;
}

export function normalizeLateEntryTime(
  value: string | null | undefined,
): string | null {
  return isHhmm(value) ? value : null;
}

/** Minutes from midnight for HH:mm. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** HH:mm clock in Asia/Bangkok. */
export function bangkokTimeHm(at = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

export function addDaysToDateKey(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return bangkokDateKey(start);
}

/**
 * Operating day key (YYYY-MM-DD) for queue / daily stats.
 * Day runs [cutoff, next cutoff). cutoff "00:00" = Bangkok calendar date.
 */
export function resolveOperatingDayKey(
  at: Date = new Date(),
  cutoffTime: string | null | undefined = DEFAULT_BUSINESS_DAY_CUTOFF,
): string {
  const cutoff = normalizeCutoffTime(cutoffTime);
  const calendarKey = bangkokDateKey(at);
  const cutMins = hhmmToMinutes(cutoff);
  if (cutMins === 0) return calendarKey;

  const nowMins = hhmmToMinutes(bangkokTimeHm(at));
  if (nowMins < cutMins) return addDaysToDateKey(calendarKey, -1);
  return calendarKey;
}

export function operatingDayDate(
  at: Date = new Date(),
  cutoffTime: string | null | undefined = DEFAULT_BUSINESS_DAY_CUTOFF,
): Date {
  return queueBusinessDateFromKey(resolveOperatingDayKey(at, cutoffTime));
}

/**
 * Staff create/edit lock in the closing window before the next operating day.
 *
 * - lateEntry < cutoff (e.g. 03:00 / 04:00): locked while clock in [late, cutoff)
 * - lateEntry >= cutoff (e.g. 22:00 / 00:00): locked from late until next cutoff
 *   (overnight/morning before cutoff included when late wraps)
 */
export function isStaffEntryLocked(
  at: Date = new Date(),
  cutoffTime: string | null | undefined,
  lateEntryUntilTime: string | null | undefined,
): boolean {
  const late = normalizeLateEntryTime(lateEntryUntilTime);
  if (!late) return false;

  const cutoff = normalizeCutoffTime(cutoffTime);
  const t = hhmmToMinutes(bangkokTimeHm(at));
  const lateMins = hhmmToMinutes(late);
  const cutMins = hhmmToMinutes(cutoff);

  if (lateMins < cutMins) {
    return t >= lateMins && t < cutMins;
  }
  return t >= lateMins || t < cutMins;
}

export function canStaffMutateOperatingDay(
  orderDayKey: string,
  at: Date = new Date(),
  cutoffTime: string | null | undefined,
  lateEntryUntilTime: string | null | undefined,
): boolean {
  if (!isBangkokDateKey(orderDayKey)) return false;
  const current = resolveOperatingDayKey(at, cutoffTime);
  if (orderDayKey !== current) return false;
  return !isStaffEntryLocked(at, cutoffTime, lateEntryUntilTime);
}

export type BranchOperatingDaySettings = {
  businessDayCutoffTime?: string | null;
  lateEntryUntilTime?: string | null;
};

export type OperatingRoundTone = "ok" | "warn" | "locked";

export type OperatingRoundStatus = {
  cutoffTime: string;
  lateEntryUntilTime: string | null;
  operatingDay: string;
  entryLocked: boolean;
  canEnter: boolean;
  /** HH:mm staff can key until (late entry or cutoff) */
  entryDeadlineHm: string;
  /** Instant of entry deadline in Asia/Bangkok */
  entryDeadlineAt: Date;
  minutesRemaining: number;
  tone: OperatingRoundTone;
};

/**
 * When staff keying for the current operating day closes.
 * - lateEntry set and before cutoff → next calendar morning at lateEntry
 * - lateEntry set and >= cutoff → same operating-day calendar at lateEntry
 * - no lateEntry → next period boundary (operatingDay+1 at cutoff)
 */
export function resolveEntryDeadlineAt(
  operatingDayKey: string,
  cutoffTime: string | null | undefined,
  lateEntryUntilTime: string | null | undefined,
): { at: Date; hm: string } {
  const cutoff = normalizeCutoffTime(cutoffTime);
  const late = normalizeLateEntryTime(lateEntryUntilTime);
  const cutMins = hhmmToMinutes(cutoff);

  if (late) {
    const lateMins = hhmmToMinutes(late);
    const dateKey =
      lateMins < cutMins
        ? addDaysToDateKey(operatingDayKey, 1)
        : operatingDayKey;
    return {
      hm: late,
      at: new Date(`${dateKey}T${late}:00+07:00`),
    };
  }

  const dateKey = addDaysToDateKey(operatingDayKey, 1);
  return {
    hm: cutoff,
    at: new Date(`${dateKey}T${cutoff}:00+07:00`),
  };
}

export function getOperatingDayState(
  branch: BranchOperatingDaySettings,
  at: Date = new Date(),
) {
  const cutoffTime = normalizeCutoffTime(branch.businessDayCutoffTime);
  const lateEntryUntilTime = normalizeLateEntryTime(branch.lateEntryUntilTime);
  const operatingDay = resolveOperatingDayKey(at, cutoffTime);
  const entryLocked = isStaffEntryLocked(at, cutoffTime, lateEntryUntilTime);
  return {
    cutoffTime,
    lateEntryUntilTime,
    operatingDay,
    entryLocked,
    canEnter: !entryLocked,
  };
}

/** Full round status for staff UI (countdown + tone). */
export function getOperatingRoundStatus(
  branch: BranchOperatingDaySettings,
  at: Date = new Date(),
): OperatingRoundStatus {
  const base = getOperatingDayState(branch, at);
  const deadline = resolveEntryDeadlineAt(
    base.operatingDay,
    base.cutoffTime,
    base.lateEntryUntilTime,
  );
  const msLeft = deadline.at.getTime() - at.getTime();
  const minutesRemaining = Math.max(0, Math.floor(msLeft / 60_000));
  const entryLocked =
    base.entryLocked || at.getTime() >= deadline.at.getTime();

  let tone: OperatingRoundTone = "ok";
  if (entryLocked) tone = "locked";
  else if (minutesRemaining <= 30) tone = "warn";

  return {
    ...base,
    entryLocked,
    canEnter: !entryLocked,
    entryDeadlineHm: deadline.hm,
    entryDeadlineAt: deadline.at,
    minutesRemaining,
    tone,
  };
}

export function formatOperatingDayLabel(dateYmd: string): string {
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

export function formatMinutesRemainingTh(minutes: number): string {
  if (minutes <= 0) return "หมดเวลาแล้ว";
  if (minutes < 60) return `เหลือ ${minutes} นาที`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `เหลือ ${h} ชม.`;
  return `เหลือ ${h} ชม. ${m} นาที`;
}

/** Short day+month for round window (e.g. 22 ก.ค.). */
export function formatOperatingDayShort(dateYmd: string): string {
  try {
    return new Date(`${dateYmd}T12:00:00+07:00`).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateYmd;
  }
}

/**
 * Human window for an operating round that may span midnight.
 * cutoff 00:00 → null (calendar day, no overnight window).
 * Compact one-line form, e.g. "11:00 น. (22–23 ก.ค.)"
 */
export function formatOperatingRoundWindow(
  operatingDayKey: string,
  cutoffTime: string | null | undefined,
): string | null {
  const cutoff = normalizeCutoffTime(cutoffTime);
  if (cutoff === DEFAULT_BUSINESS_DAY_CUTOFF) return null;
  if (!isBangkokDateKey(operatingDayKey)) return null;
  const nextKey = addDaysToDateKey(operatingDayKey, 1);

  try {
    const start = new Date(`${operatingDayKey}T12:00:00+07:00`);
    const end = new Date(`${nextKey}T12:00:00+07:00`);
    const startDay = start.toLocaleDateString("th-TH", { day: "numeric" });
    const endDay = end.toLocaleDateString("th-TH", { day: "numeric" });
    const startMonth = start.toLocaleDateString("th-TH", { month: "short" });
    const endMonth = end.toLocaleDateString("th-TH", { month: "short" });
    const range =
      startMonth === endMonth
        ? `${startDay}–${endDay} ${startMonth}`
        : `${startDay} ${startMonth}–${endDay} ${endMonth}`;
    return `${cutoff} น. (${range})`;
  } catch {
    return `${cutoff} น. (${formatOperatingDayShort(operatingDayKey)}–${formatOperatingDayShort(nextKey)})`;
  }
}

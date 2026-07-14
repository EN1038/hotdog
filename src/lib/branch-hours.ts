import { z } from "zod";
import type { FulfillmentType } from "@prisma/client";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const hoursSlotSchema = z.object({
  opensAt: z.string().regex(HHMM, "เวลาต้องเป็น HH:mm"),
  closesAt: z.string().regex(HHMM, "เวลาต้องเป็น HH:mm"),
});

export const dayScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  is24Hours: z.boolean(),
  slots: z.array(hoursSlotSchema).max(8),
});

export const weeklyScheduleSchema = z
  .array(dayScheduleSchema)
  .length(7)
  .superRefine((days, ctx) => {
    const seen = new Set<number>();
    for (let i = 0; i < days.length; i++) {
      const d = days[i]!;
      if (seen.has(d.dayOfWeek)) {
        ctx.addIssue({
          code: "custom",
          message: `วันซ้ำ dayOfWeek=${d.dayOfWeek}`,
          path: [i, "dayOfWeek"],
        });
      }
      seen.add(d.dayOfWeek);
      if (d.isOpen && !d.is24Hours && d.slots.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "วันที่เปิดต้องมีอย่างน้อย 1 ช่วงเวลา หรือเปิด 24 ชม.",
          path: [i, "slots"],
        });
      }
    }
    for (let dow = 0; dow <= 6; dow++) {
      if (!seen.has(dow)) {
        ctx.addIssue({
          code: "custom",
          message: `ขาดวัน dayOfWeek=${dow}`,
          path: [],
        });
      }
    }
  });

export type HoursSlot = z.infer<typeof hoursSlotSchema>;
export type DaySchedule = z.infer<typeof dayScheduleSchema>;
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;

export const DAY_LABELS_TH = [
  "อาทิตย์",
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
] as const;

/** Display order Mon→Sun (JS dayOfWeek 1,2,3,4,5,6,0) */
export const DAY_ORDER_MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

const BANGKOK = "Asia/Bangkok";

export function defaultWeeklyHours(
  opensAt = "10:00",
  closesAt = "22:00",
): WeeklySchedule {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    is24Hours: false,
    slots: [{ opensAt, closesAt }],
  }));
}

export function migrateLegacyHours(
  opensAt: string | null | undefined,
  closesAt: string | null | undefined,
): WeeklySchedule {
  const open = opensAt && HHMM.test(opensAt) ? opensAt : "10:00";
  const close = closesAt && HHMM.test(closesAt) ? closesAt : "22:00";
  return defaultWeeklyHours(open, close);
}

export function parseWeeklySchedule(value: unknown): WeeklySchedule | null {
  const parsed = weeklyScheduleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function ensureWeeklySchedule(
  value: unknown,
  legacyOpensAt?: string | null,
  legacyClosesAt?: string | null,
): WeeklySchedule {
  return (
    parseWeeklySchedule(value) ??
    migrateLegacyHours(legacyOpensAt, legacyClosesAt)
  );
}

function minutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

/** True if `minutes` falls in [open, close) — supports overnight. */
function inSlot(minutes: number, opensAt: string, closesAt: string): boolean {
  const a = minutesSinceMidnight(opensAt);
  const b = minutesSinceMidnight(closesAt);
  if (a === b) return true; // treat identical as all-day edge case
  if (a < b) return minutes >= a && minutes < b;
  // overnight: e.g. 22:00–02:00
  return minutes >= a || minutes < b;
}

function getBangkokParts(date: Date): { dayOfWeek: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: BANGKOK,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    dayOfWeek: map[weekday] ?? 0,
    minutes: hour * 60 + minute,
  };
}

export function isWithinWeeklySchedule(
  schedule: WeeklySchedule,
  date: Date = new Date(),
): boolean {
  const { dayOfWeek, minutes } = getBangkokParts(date);
  const day = schedule.find((d) => d.dayOfWeek === dayOfWeek);
  if (!day || !day.isOpen) return false;
  if (day.is24Hours) return true;
  return day.slots.some((s) => inSlot(minutes, s.opensAt, s.closesAt));
}

/** Also true if overnight slot from *yesterday* covers now (e.g. Fri 22–Sat 02). */
export function isWithinWeeklyScheduleWithOvernight(
  schedule: WeeklySchedule,
  date: Date = new Date(),
): boolean {
  if (isWithinWeeklySchedule(schedule, date)) return true;
  const { dayOfWeek, minutes } = getBangkokParts(date);
  const prevDow = (dayOfWeek + 6) % 7;
  const prev = schedule.find((d) => d.dayOfWeek === prevDow);
  if (!prev || !prev.isOpen || prev.is24Hours) return false;
  return prev.slots.some((s) => {
    const a = minutesSinceMidnight(s.opensAt);
    const b = minutesSinceMidnight(s.closesAt);
    if (a >= b) {
      // overnight into today
      return minutes < b;
    }
    return false;
  });
}

export type BranchHoursFields = {
  isOpen: boolean;
  allowAdvanceOrder: boolean;
  storefrontHours?: unknown;
  deliveryHours?: unknown;
  opensAt?: string | null;
  closesAt?: string | null;
};

export type ServiceStatus = {
  /** Accepting orders for immediate fulfillment right now */
  openNow: boolean;
  /** Can place an order (open now OR advance allowed for today before reopen) */
  acceptingOrders: boolean;
  /** True when accepting only as same-day advance (before remaining open hours) */
  advanceOnly: boolean;
  reason: string;
  schedule: WeeklySchedule;
};

export function resolveScheduleForFulfillment(
  branch: BranchHoursFields,
  fulfillment: FulfillmentType | "PICKUP" | "DELIVERY",
): WeeklySchedule {
  if (fulfillment === "DELIVERY") {
    return ensureWeeklySchedule(
      branch.deliveryHours,
      branch.opensAt,
      branch.closesAt,
    );
  }
  return ensureWeeklySchedule(
    branch.storefrontHours,
    branch.opensAt,
    branch.closesAt,
  );
}

/**
 * Advance orders: same day only, before remaining open time —
 * allowed when there is still a slot later today; not after the last close.
 */
export function canAcceptAdvanceOrderToday(
  schedule: WeeklySchedule,
  now: Date = new Date(),
): boolean {
  if (isWithinWeeklyScheduleWithOvernight(schedule, now)) return false;

  const { dayOfWeek, minutes } = getBangkokParts(now);
  const day = schedule.find((d) => d.dayOfWeek === dayOfWeek);
  if (!day || !day.isOpen || day.is24Hours) return false;

  return day.slots.some((slot) => {
    const openM = minutesSinceMidnight(slot.opensAt);
    // Upcoming slot today (or mid-day gap before next slot)
    return openM > minutes;
  });
}

export function bangkokDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isSameBangkokDay(a: Date, b: Date): boolean {
  return bangkokDateKey(a) === bangkokDateKey(b);
}

export function getBranchServiceStatus(
  branch: BranchHoursFields,
  fulfillment: FulfillmentType | "PICKUP" | "DELIVERY",
  now: Date = new Date(),
): ServiceStatus {
  const schedule = resolveScheduleForFulfillment(branch, fulfillment);
  const label = fulfillment === "DELIVERY" ? "เดลิเวอรี" : "หน้าร้าน";

  if (!branch.isOpen) {
    return {
      openNow: false,
      acceptingOrders: false,
      advanceOnly: false,
      reason: "ร้านปิดชั่วคราว",
      schedule,
    };
  }

  const openNow = isWithinWeeklyScheduleWithOvernight(schedule, now);
  if (openNow) {
    return {
      openNow: true,
      acceptingOrders: true,
      advanceOnly: false,
      reason: `เปิดรับ${label}`,
      schedule,
    };
  }

  if (branch.allowAdvanceOrder && canAcceptAdvanceOrderToday(schedule, now)) {
    return {
      openNow: false,
      acceptingOrders: true,
      advanceOnly: true,
      reason: `ยังไม่ถึงเวลาเปิด${label} — สั่งล่วงหน้าได้เฉพาะวันนี้`,
      schedule,
    };
  }

  return {
    openNow: false,
    acceptingOrders: false,
    advanceOnly: false,
    reason: `อยู่นอกเวลาเปิด${label}`,
    schedule,
  };
}

/** Human summary for today for a schedule */
export function formatTodayHoursSummary(
  schedule: WeeklySchedule,
  date: Date = new Date(),
): string {
  const { dayOfWeek } = getBangkokParts(date);
  const day = schedule.find((d) => d.dayOfWeek === dayOfWeek);
  if (!day || !day.isOpen) return "ปิดวันนี้";
  if (day.is24Hours) return "เปิด 24 ชั่วโมง";
  if (day.slots.length === 0) return "ปิดวันนี้";
  return day.slots.map((s) => `${s.opensAt}–${s.closesAt}`).join(", ");
}

export function copyDayToWeek(
  schedule: WeeklySchedule,
  sourceDayOfWeek: number,
): WeeklySchedule {
  const source = schedule.find((d) => d.dayOfWeek === sourceDayOfWeek);
  if (!source) return schedule;
  return schedule.map((d) =>
    d.dayOfWeek === sourceDayOfWeek
      ? d
      : {
          dayOfWeek: d.dayOfWeek,
          isOpen: source.isOpen,
          is24Hours: source.is24Hours,
          slots: source.slots.map((s) => ({ ...s })),
        },
  );
}

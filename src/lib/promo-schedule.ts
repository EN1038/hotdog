import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";
import type { StatusTone } from "@/lib/status-badge";

/** หลังหมดอายุ ยังโชว์ที่หน้าร้านกี่วัน (ใช้ขายไม่ได้) */
export const PROMO_EXPIRED_GRACE_DAYS = 3;

export type PromoScheduleFields = {
  promoContinuous?: boolean | null;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
};

export type PromoScheduleStatus =
  | "active"
  | "upcoming"
  | "expired_grace"
  | "expired_hidden";

export const PROMO_SCHEDULE_STATUS_LABEL: Record<PromoScheduleStatus, string> = {
  active: "ใช้งานได้",
  upcoming: "ยังไม่เริ่ม",
  expired_grace: "หมดอายุแล้ว",
  expired_hidden: "หมดอายุ (ซ่อนแล้ว)",
};

export const PROMO_SCHEDULE_STATUS_TONE: Record<PromoScheduleStatus, StatusTone> =
  {
    active: "active",
    upcoming: "info",
    expired_grace: "warning",
    expired_hidden: "neutral",
  };

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** วันสิ้นสุดแบบ YYYY-MM-DD → สิ้นวัน Bangkok */
export function bangkokEndOfDayFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999+07:00`);
}

export function bangkokStartOfDayFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000+07:00`);
}

function addBangkokDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return bangkokDateKey(d);
}

/**
 * สถานะช่วงโปรตามวันเริ่ม/วันหมด
 * - ไม่มีวันหมด / continuous → active ตลอด
 * - หมดแล้ว ≤ 3 วัน → expired_grace (โชว์แต่ขายไม่ได้)
 * - หมดแล้ว > 3 วัน → expired_hidden (ไม่โชว์หน้าร้าน)
 */
export function getPromoScheduleStatus(
  item: PromoScheduleFields,
  now = new Date(),
): PromoScheduleStatus {
  if (item.promoContinuous === true) return "active";

  const start = toDate(item.promoStartsAt);
  const end = toDate(item.promoEndsAt);

  if (!start && !end) return "active";

  if (start && now < start) return "upcoming";

  if (end && now > end) {
    const endKey = bangkokDateKey(end);
    const graceLastKey = addBangkokDays(endKey, PROMO_EXPIRED_GRACE_DAYS);
    const todayKey = bangkokDateKey(now);
    if (todayKey <= graceLastKey) return "expired_grace";
    return "expired_hidden";
  }

  return "active";
}

export function isPromoScheduleSellable(status: PromoScheduleStatus): boolean {
  return status === "active";
}

/** โชว์บนหน้าร้าน / คีย์โปร */
export function isPromoScheduleVisibleOnShop(
  status: PromoScheduleStatus,
): boolean {
  return status === "active" || status === "expired_grace";
}

export function serializePromoSchedule(item: {
  promoContinuous?: boolean | null;
  promoStartsAt?: Date | null;
  promoEndsAt?: Date | null;
}) {
  return {
    promoContinuous: Boolean(item.promoContinuous),
    promoStartsAt: item.promoStartsAt?.toISOString() ?? null,
    promoEndsAt: item.promoEndsAt?.toISOString() ?? null,
  };
}

export function parsePromoScheduleInput(body: {
  promoStartsAt?: string | null;
  promoEndsAt?: string | null;
  promoContinuous?: boolean | null;
  clearSchedule?: boolean;
}): {
  promoContinuous: boolean;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
} {
  if (body.clearSchedule) {
    return {
      promoContinuous: true,
      promoStartsAt: null,
      promoEndsAt: null,
    };
  }

  const continuous = body.promoContinuous === true;
  if (continuous) {
    return {
      promoContinuous: true,
      promoStartsAt: null,
      promoEndsAt: null,
    };
  }

  const startRaw = body.promoStartsAt?.trim() || null;
  const endRaw = body.promoEndsAt?.trim() || null;

  let promoStartsAt: Date | null = null;
  let promoEndsAt: Date | null = null;

  if (startRaw) {
    if (isBangkokDateKey(startRaw)) {
      promoStartsAt = bangkokStartOfDayFromKey(startRaw);
    } else {
      const d = new Date(startRaw);
      if (!Number.isNaN(d.getTime())) promoStartsAt = d;
    }
  }
  if (endRaw) {
    if (isBangkokDateKey(endRaw)) {
      promoEndsAt = bangkokEndOfDayFromKey(endRaw);
    } else {
      const d = new Date(endRaw);
      if (!Number.isNaN(d.getTime())) promoEndsAt = d;
    }
  }

  if (promoStartsAt && promoEndsAt && promoEndsAt < promoStartsAt) {
    throw new Error("วันหมดอายุต้องไม่ก่อนวันเริ่ม");
  }

  return {
    promoContinuous: false,
    promoStartsAt,
    promoEndsAt,
  };
}

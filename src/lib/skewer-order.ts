import type { SkewerOrderStatus } from "@prisma/client";
import {
  generateOrderNumber,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";

export const SKEWER_MIN_QTY_PER_ITEM = 12;

export const SKEWER_ORDER_STATUS_LABELS: Record<SkewerOrderStatus, string> = {
  PENDING_CONFIRM: "รอยืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  CANCELLED: "ยกเลิก",
};

export function parseRequestedDateKey(value: string): Date | null {
  const key = value.trim().slice(0, 10);
  if (!isBangkokDateKey(key)) return null;
  return queueBusinessDateFromKey(key);
}

export function requestedDateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function nextSkewerOrderNumber(): string {
  return `S${generateOrderNumber()}`;
}

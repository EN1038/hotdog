import type { SkewerOrderStatus } from "@prisma/client";
import {
  generateOrderNumber,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";

export const SKEWER_MIN_QTY_PER_ITEM = 12;

/** Portrait frame for skewer menu photos (matches typical phone/menu shots ≈ 3:4). */
export const SKEWER_PHOTO_ASPECT = 3 / 4;
export const SKEWER_PHOTO_ASPECT_CLASS = "aspect-[3/4]";

/** Prefer skewer-specific photo; fall back to normal menu image. */
export function resolveSkewerMenuImageUrl(item: {
  imageUrl?: string | null;
  skewerImageUrl?: string | null;
}): string | null {
  const skewer = item.skewerImageUrl?.trim();
  if (skewer) return skewer;
  const normal = item.imageUrl?.trim();
  return normal || null;
}

/** Pick the menu thumbnail that matches the branch operating mode. */
export function resolveMenuDisplayImageUrl(
  mode: string | null | undefined,
  item: { imageUrl?: string | null; skewerImageUrl?: string | null },
): string | null {
  if (mode === "SKEWER") return resolveSkewerMenuImageUrl(item);
  const normal = item.imageUrl?.trim();
  return normal || null;
}

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

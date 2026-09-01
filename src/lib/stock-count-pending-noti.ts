import { bangkokDateKey } from "@/lib/constants";
import { addDaysToDateKey } from "@/lib/operating-day";

/**
 * เอกสารรอ Convert ที่เก่ากว่านี้ไม่โชว์ใน badge / งานท้ายวัน
 * (ยังเปิดดูและ Convert ได้ในสรุปยอดตามปกติ)
 */
export const PENDING_CONVERT_NOTI_MAX_AGE_DAYS = 3;

/** จุดตัด Bangkok: เริ่มวัน (วันนี้ − N วัน) — เก่ากว่านี้ไม่นับใน noti */
export function pendingConvertNotiCreatedAtGte(now = new Date()): Date {
  const today = bangkokDateKey(now);
  const fromKey = addDaysToDateKey(today, -PENDING_CONVERT_NOTI_MAX_AGE_DAYS);
  return new Date(`${fromKey}T00:00:00+07:00`);
}

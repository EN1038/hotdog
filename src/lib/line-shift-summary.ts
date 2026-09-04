import type { ShiftSummary } from "@/lib/branch-shift";

/**
 * Push LINE summary for a closed shift to brand owners/managers.
 * @deprecated Platform OA no longer sends shift/order summaries.
 */
export async function sendShiftCloseLineSummary(
  _summary: ShiftSummary,
): Promise<{ sent: number; skippedReason?: string }> {
  return { sent: 0, skippedReason: "ปิดการแจ้งสรุปรอบแล้ว" };
}

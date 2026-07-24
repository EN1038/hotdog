import { appAbsoluteUrl } from "@/lib/app-url";
import type { ShiftSummary } from "@/lib/branch-shift";
import { formatPrice } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isLineMessagingReady,
  linePushText,
} from "@/lib/line";

const LINE_TEXT_MAX = 4800;

function money(n: number) {
  return formatPrice(Math.round(n));
}

function formatHm(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function formatDayLabel(dateYmd: string) {
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

async function recipientsForBrand(brandId: string) {
  const members = await prisma.brandMember.findMany({
    where: {
      brandId,
      role: { in: ["OWNER", "MANAGER"] },
      admin: {
        lineUserId: { not: null },
        lineNotifyEnabled: true,
        lineNotifyDailySummary: true,
      },
    },
    select: {
      admin: { select: { lineUserId: true } },
    },
  });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of members) {
    const id = m.admin.lineUserId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function formatShiftSummaryMessage(
  summary: ShiftSummary,
  meta?: { brandName?: string | null; branchName?: string | null },
): string {
  const dayLabel = formatDayLabel(summary.shift.calendarDate);
  const header = [
    "สรุปรอบขาย",
    meta?.brandName && meta?.branchName
      ? `${meta.brandName} · ${meta.branchName}`
      : meta?.branchName || null,
    dayLabel,
    summary.shift.code,
    `เปิด ${formatHm(summary.shift.openedAt)} – ปิด ${formatHm(summary.shift.closedAt)} น.`,
    "",
    `ออเดอร์ ${summary.orderCount.toLocaleString("th-TH")} รายการ`,
    summary.cancelledOrders > 0
      ? `ยกเลิก ${summary.cancelledOrders.toLocaleString("th-TH")}`
      : null,
    `เงินเริ่มต้น ฿${money(summary.shift.openingCash)}`,
    summary.shift.note ? `หมายเหตุ ${summary.shift.note}` : null,
    `เงินสด ฿${money(summary.cashRevenueBaht)}`,
    `โอน ฿${money(summary.transferRevenueBaht)}`,
    `ยอดขายสุทธิ ฿${money(summary.revenueBaht)}`,
    `ยอดรวมเงินเริ่มต้น ฿${money(summary.totalWithOpeningCash)}`,
    summary.giftQuantity > 0
      ? `ของแถม ${summary.giftQuantity.toLocaleString("th-TH")} ชิ้น`
      : null,
  ].filter((line) => line !== null);

  const menuLines: string[] = [];
  if (summary.menus.length === 0) {
    menuLines.push("", "เมนูที่ขาย: ไม่มี");
  } else {
    menuLines.push("", "เมนูที่ขาย:");
    for (const m of summary.menus.slice(0, 25)) {
      menuLines.push(
        `· ${m.name} ×${m.quantity} (฿${money(m.revenueBaht)})`,
      );
    }
    if (summary.menus.length > 25) {
      menuLines.push(`· …และอีก ${summary.menus.length - 25} รายการ`);
    }
  }

  let body = [...header, ...menuLines].join("\n");
  if (body.length > LINE_TEXT_MAX) {
    body = body.slice(0, LINE_TEXT_MAX - 20) + "\n…(ตัดข้อความ)";
  }
  return body;
}

/**
 * Push LINE summary for a closed shift to brand owners/managers.
 * No-ops when messaging is off or there are no recipients.
 */
export async function sendShiftCloseLineSummary(
  summary: ShiftSummary,
): Promise<{ sent: number; skippedReason?: string }> {
  if (!(await isLineMessagingReady())) {
    return { sent: 0, skippedReason: "LINE ไม่พร้อม" };
  }

  const settings = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: { lineNotifyBrandDailySummary: true },
  });
  if (!settings?.lineNotifyBrandDailySummary) {
    return { sent: 0, skippedReason: "ปิดการแจ้งสรุปรอบไว้" };
  }

  const shiftRow = await prisma.branchShift.findUnique({
    where: { id: summary.shift.id },
    select: {
      branchId: true,
      branch: {
        select: {
          name: true,
          brandId: true,
          brand: { select: { name: true } },
        },
      },
    },
  });
  if (!shiftRow?.branch.brandId) {
    return { sent: 0, skippedReason: "สาขาไม่มีแบรนด์" };
  }

  const recipients = await recipientsForBrand(shiftRow.branch.brandId);
  if (recipients.length === 0) {
    return { sent: 0, skippedReason: "ไม่มีผู้รับ LINE" };
  }

  const detailUrl = appAbsoluteUrl(
    `/admin/branches/${shiftRow.branchId}?tab=shifts&date=${summary.shift.calendarDate}`,
  );
  const text = [
    formatShiftSummaryMessage(summary, {
      brandName: shiftRow.branch.brand?.name ?? null,
      branchName: shiftRow.branch.name,
    }),
    "",
    "ดูรายละเอียด:",
    detailUrl,
  ].join("\n");

  const results = await Promise.allSettled(
    recipients.map((lineUserId) => linePushText(lineUserId, text)),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent };
}

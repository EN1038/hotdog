import { prisma } from "@/lib/db";
import { appAbsoluteUrl } from "@/lib/app-url";
import {
  formatShiftCode,
  shiftCalendarDateKey,
} from "@/lib/branch-shift";
import {
  formatPrice,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import {
  addDaysToDateKey,
  formatOperatingRoundWindow,
  getOperatingDayState,
  normalizeCutoffTime,
} from "@/lib/operating-day";
import {
  isCancelledStatus,
  isRevenueStatus,
  orderGrandTotal,
} from "@/lib/order-totals";
import {
  isLineMessagingReady,
  linePushText,
} from "@/lib/line";

const LINE_TEXT_MAX = 4800;
const TOP_CANCEL_REASONS = 5;

export type BranchDayShiftSummary = {
  shiftId: string | null;
  code: string;
  roundNumber: number | null;
  openedAt: string | null;
  closedAt: string | null;
  completedCount: number;
  completedRevenue: number;
  cancelledCount: number;
  giftQuantity: number;
};

export type BranchDaySummary = {
  branchId: string;
  branchName: string;
  brandId: string | null;
  brandName: string | null;
  operatingDay: string;
  cutoffTime: string;
  completedCount: number;
  completedRevenue: number;
  cancelledCount: number;
  cancelledRevenue: number;
  openCount: number;
  totalOrders: number;
  soldItems: Array<{ name: string; quantity: number; revenue: number }>;
  cancelReasons: Array<{ reason: string; count: number }>;
  shifts: BranchDayShiftSummary[];
  detailUrl: string;
};

function money(n: number) {
  return formatPrice(Math.round(n));
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

function formatHmBangkok(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

type ShiftAgg = {
  shiftId: string | null;
  code: string;
  roundNumber: number | null;
  openedAt: string | null;
  closedAt: string | null;
  completedCount: number;
  completedRevenue: number;
  cancelledCount: number;
  giftQuantity: number;
};

function emptyShiftAgg(
  partial: Pick<
    ShiftAgg,
    "shiftId" | "code" | "roundNumber" | "openedAt" | "closedAt"
  >,
): ShiftAgg {
  return {
    ...partial,
    completedCount: 0,
    completedRevenue: 0,
    cancelledCount: 0,
    giftQuantity: 0,
  };
}

export async function buildBranchDaySummary(
  branchId: string,
  operatingDay: string,
): Promise<BranchDaySummary | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      businessDayCutoffTime: true,
      brandId: true,
      brand: { select: { id: true, name: true } },
    },
  });
  if (!branch) return null;

  const businessDate = queueBusinessDateFromKey(operatingDay);
  const [orders, dayShifts] = await Promise.all([
    prisma.order.findMany({
      where: { branchId, queueBusinessDate: businessDate },
      select: {
        status: true,
        shiftId: true,
        deliveryFee: true,
        discountAmount: true,
        cancelReason: true,
        items: {
          select: {
            itemName: true,
            quantity: true,
            unitPrice: true,
            optionsPrice: true,
            giftQuantity: true,
          },
        },
      },
    }),
    prisma.branchShift.findMany({
      where: { branchId, calendarDate: businessDate },
      select: {
        id: true,
        calendarDate: true,
        roundNumber: true,
        openedAt: true,
        closedAt: true,
      },
      orderBy: { roundNumber: "asc" },
    }),
  ]);

  let completedCount = 0;
  let completedRevenue = 0;
  let cancelledCount = 0;
  let cancelledRevenue = 0;
  let openCount = 0;
  const soldMap = new Map<string, { quantity: number; revenue: number }>();
  const cancelReasonMap = new Map<string, number>();
  const shiftAggs = new Map<string, ShiftAgg>();

  for (const shift of dayShifts) {
    const calendarDate = shiftCalendarDateKey(shift);
    shiftAggs.set(
      shift.id,
      emptyShiftAgg({
        shiftId: shift.id,
        code: formatShiftCode({
          calendarDate,
          roundNumber: shift.roundNumber,
        }),
        roundNumber: shift.roundNumber,
        openedAt: shift.openedAt.toISOString(),
        closedAt: shift.closedAt?.toISOString() ?? null,
      }),
    );
  }

  for (const order of orders) {
    const total = orderGrandTotal(
      order.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(order.deliveryFee),
      Number(order.discountAmount),
    );
    const giftQty = order.items.reduce(
      (sum, it) => sum + Math.max(0, Number(it.giftQuantity ?? 0)),
      0,
    );

    const shiftKey = order.shiftId ?? "__none__";
    let agg = shiftAggs.get(shiftKey);
    if (!agg) {
      agg = emptyShiftAgg({
        shiftId: order.shiftId,
        code: order.shiftId ? `SHIFT-${order.shiftId.slice(0, 8)}` : "ไม่มีรอบ",
        roundNumber: null,
        openedAt: null,
        closedAt: null,
      });
      shiftAggs.set(shiftKey, agg);
    }

    if (isRevenueStatus(order.status)) {
      completedCount += 1;
      completedRevenue += total;
      agg.completedCount += 1;
      agg.completedRevenue += total;
      agg.giftQuantity += giftQty;
      for (const it of order.items) {
        const name = it.itemName.trim() || "รายการ";
        const lineRev =
          (Number(it.unitPrice) + Number(it.optionsPrice)) * it.quantity;
        const prev = soldMap.get(name) ?? { quantity: 0, revenue: 0 };
        prev.quantity += it.quantity;
        prev.revenue += lineRev;
        soldMap.set(name, prev);
      }
    } else if (isCancelledStatus(order.status)) {
      cancelledCount += 1;
      cancelledRevenue += total;
      agg.cancelledCount += 1;
      const reason = order.cancelReason?.trim() || "ไม่ระบุเหตุผล";
      cancelReasonMap.set(reason, (cancelReasonMap.get(reason) ?? 0) + 1);
    } else {
      openCount += 1;
    }
  }

  const soldItems = [...soldMap.entries()]
    .map(([name, agg]) => ({
      name,
      quantity: agg.quantity,
      revenue: Math.round(agg.revenue * 100) / 100,
    }))
    .sort(
      (a, b) =>
        b.quantity - a.quantity ||
        b.revenue - a.revenue ||
        a.name.localeCompare(b.name, "th"),
    );

  const cancelReasons = [...cancelReasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "th"))
    .slice(0, TOP_CANCEL_REASONS);

  const shifts: BranchDayShiftSummary[] = [...shiftAggs.values()]
    .sort((a, b) => {
      if (a.shiftId === null) return 1;
      if (b.shiftId === null) return -1;
      const ra = a.roundNumber ?? 9999;
      const rb = b.roundNumber ?? 9999;
      return ra - rb || a.code.localeCompare(b.code);
    })
    .map((s) => ({
      ...s,
      completedRevenue: Math.round(s.completedRevenue * 100) / 100,
    }));

  return {
    branchId: branch.id,
    branchName: branch.name,
    brandId: branch.brand?.id ?? branch.brandId,
    brandName: branch.brand?.name ?? null,
    operatingDay,
    cutoffTime: normalizeCutoffTime(branch.businessDayCutoffTime),
    completedCount,
    completedRevenue: Math.round(completedRevenue * 100) / 100,
    cancelledCount,
    cancelledRevenue: Math.round(cancelledRevenue * 100) / 100,
    openCount,
    totalOrders: orders.length,
    soldItems,
    cancelReasons,
    shifts,
    detailUrl: appAbsoluteUrl(
      `/admin/branches/${branch.id}?tab=orders&date=${operatingDay}`,
    ),
  };
}

export function formatBranchDaySummaryMessage(summary: BranchDaySummary): string {
  const dayLabel = formatDayLabel(summary.operatingDay);
  const window =
    formatOperatingRoundWindow(summary.operatingDay, summary.cutoffTime) ??
    `ตัดรอบ ${summary.cutoffTime} น.`;

  const header = [
    "สรุปตัดรอบ",
    summary.brandName ? `${summary.brandName} · ${summary.branchName}` : summary.branchName,
    `${dayLabel}`,
    window,
    "",
    "ยอดรวมทั้งวัน",
    `ออเดอร์ทั้งหมด ${summary.totalOrders} รายการ`,
    `สำเร็จ ${summary.completedCount} · ฿${money(summary.completedRevenue)}`,
    `ยกเลิก ${summary.cancelledCount} · ฿${money(summary.cancelledRevenue)}`,
    summary.openCount > 0
      ? `ค้างในระบบตอนตัดรอบ ${summary.openCount}`
      : null,
  ].filter((line) => line !== null);

  const shiftLines: string[] = [];
  if (summary.shifts.length === 0) {
    shiftLines.push("", "รอบขาย: ไม่มี");
  } else {
    for (const shift of summary.shifts) {
      shiftLines.push("", `── ${shift.code} ──`);
      if (shift.openedAt || shift.closedAt) {
        shiftLines.push(
          `เปิด ${formatHmBangkok(shift.openedAt)} – ปิด ${formatHmBangkok(shift.closedAt)} น.`,
        );
      }
      shiftLines.push(
        `สำเร็จ ${shift.completedCount} · ฿${money(shift.completedRevenue)}`,
      );
      if (shift.giftQuantity > 0) {
        shiftLines.push(`ของแถม ${shift.giftQuantity}`);
      }
      if (shift.cancelledCount > 0) {
        shiftLines.push(`ยกเลิก ${shift.cancelledCount}`);
      }
    }
  }

  const soldLines: string[] = [];
  if (summary.soldItems.length === 0) {
    soldLines.push("", "ขายออก (สำเร็จ): ไม่มี");
  } else {
    soldLines.push("", "ขายออก (สำเร็จ):");
    for (const item of summary.soldItems) {
      soldLines.push(
        `· ${item.name} ×${item.quantity} (฿${money(item.revenue)})`,
      );
    }
  }

  const cancelLines: string[] = [];
  if (summary.cancelledCount > 0) {
    cancelLines.push("", "เหตุผลยกเลิก:");
    if (summary.cancelReasons.length === 0) {
      cancelLines.push("· ไม่ระบุ");
    } else {
      for (const row of summary.cancelReasons) {
        cancelLines.push(`· ${row.reason} ×${row.count}`);
      }
    }
  }

  const footer = ["", "ดูรายละเอียด:", summary.detailUrl];

  let body = [
    ...header,
    ...shiftLines,
    ...soldLines,
    ...cancelLines,
    ...footer,
  ].join("\n");
  if (body.length <= LINE_TEXT_MAX) return body;

  // Truncate sold list to fit, keep day totals + shift blocks + link
  const reserve =
    [...header, ...shiftLines, "", "ขายออก (สำเร็จ):", ...cancelLines, ...footer]
      .join("\n").length + 80;
  const budget = Math.max(200, LINE_TEXT_MAX - reserve);
  const kept: string[] = [];
  let used = 0;
  let omitted = 0;
  for (const item of summary.soldItems) {
    const line = `· ${item.name} ×${item.quantity} (฿${money(item.revenue)})`;
    if (used + line.length + 1 > budget) {
      omitted += 1;
      continue;
    }
    kept.push(line);
    used += line.length + 1;
  }
  if (omitted > 0) kept.push(`· …และอีก ${omitted} รายการ`);

  body = [
    ...header,
    ...shiftLines,
    "",
    "ขายออก (สำเร็จ):",
    ...(kept.length ? kept : ["· ไม่มี"]),
    ...cancelLines,
    ...footer,
  ].join("\n");

  if (body.length > LINE_TEXT_MAX) {
    return body.slice(0, LINE_TEXT_MAX - 20) + "\n…(ตัดข้อความ)";
  }
  return body;
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
      admin: { select: { lineUserId: true, username: true } },
    },
  });

  const seen = new Set<string>();
  const out: { lineUserId: string; username: string }[] = [];
  for (const m of members) {
    const id = m.admin.lineUserId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ lineUserId: id, username: m.admin.username });
  }
  return out;
}

export type DailySummaryRunOptions = {
  /** Force send even if already logged (still updates log). */
  force?: boolean;
  /** Only this branch */
  branchId?: string;
  /** Explicit operating day (YYYY-MM-DD). Default = day that just closed. */
  operatingDay?: string;
};

export type DailySummaryRunResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
  details: Array<{
    branchId: string;
    branchName: string;
    operatingDay: string;
    status: "sent" | "skipped" | "error";
    recipients?: number;
    reason?: string;
  }>;
};

/**
 * Send LINE daily summaries for branches whose previous operating day
 * has not been notified yet (typically right after cutoff).
 */
export async function runLineDailySummaries(
  options: DailySummaryRunOptions = {},
): Promise<DailySummaryRunResult> {
  const result: DailySummaryRunResult = {
    checked: 0,
    sent: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  if (!(await isLineMessagingReady())) {
    result.errors.push("LINE messaging ยังไม่พร้อมหรือยังไม่เปิดใช้");
    return result;
  }

  const settings = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: { lineNotifyBrandDailySummary: true },
  });
  if (!settings?.lineNotifyBrandDailySummary && !options.force) {
    result.errors.push("ปิดการแจ้งสรุปตัดรอบไว้ในการตั้งค่า");
    return result;
  }

  const branches = await prisma.branch.findMany({
    where: {
      ...(options.branchId ? { id: options.branchId } : {}),
      brandId: { not: null },
      isHidden: false,
    },
    select: {
      id: true,
      name: true,
      brandId: true,
      businessDayCutoffTime: true,
      lateEntryUntilTime: true,
    },
  });

  for (const branch of branches) {
    result.checked += 1;
    const dayState = getOperatingDayState(branch);
    const closedDay =
      options.operatingDay?.trim() ||
      addDaysToDateKey(dayState.operatingDay, -1);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(closedDay)) {
      result.skipped += 1;
      result.details.push({
        branchId: branch.id,
        branchName: branch.name,
        operatingDay: closedDay,
        status: "skipped",
        reason: "วันที่ไม่ถูกต้อง",
      });
      continue;
    }

    // Don't send "today's" still-open round unless force + explicit day
    if (
      !options.force &&
      closedDay === dayState.operatingDay
    ) {
      result.skipped += 1;
      result.details.push({
        branchId: branch.id,
        branchName: branch.name,
        operatingDay: closedDay,
        status: "skipped",
        reason: "รอบยังไม่ปิด",
      });
      continue;
    }

    // Only auto-send within 24h after cutoff (catch-up if cron was down)
    if (!options.force) {
      const closedEnd = new Date(
        `${addDaysToDateKey(closedDay, 1)}T${normalizeCutoffTime(branch.businessDayCutoffTime)}:00+07:00`,
      );
      const ageMs = Date.now() - closedEnd.getTime();
      if (ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) {
        result.skipped += 1;
        result.details.push({
          branchId: branch.id,
          branchName: branch.name,
          operatingDay: closedDay,
          status: "skipped",
          reason: "นอกช่วงแจ้งเตือนหลังตัดรอบ",
        });
        continue;
      }
    }

    const businessDate = queueBusinessDateFromKey(closedDay);
    if (!options.force) {
      const existing = await prisma.lineDailySummaryLog.findUnique({
        where: {
          branchId_operatingDay: {
            branchId: branch.id,
            operatingDay: businessDate,
          },
        },
        select: { id: true },
      });
      if (existing) {
        result.skipped += 1;
        result.details.push({
          branchId: branch.id,
          branchName: branch.name,
          operatingDay: closedDay,
          status: "skipped",
          reason: "ส่งไปแล้ว",
        });
        continue;
      }
    }

    if (!branch.brandId) {
      result.skipped += 1;
      result.details.push({
        branchId: branch.id,
        branchName: branch.name,
        operatingDay: closedDay,
        status: "skipped",
        reason: "ไม่มีแบรนด์",
      });
      continue;
    }

    try {
      const summary = await buildBranchDaySummary(branch.id, closedDay);
      if (!summary) {
        result.skipped += 1;
        result.details.push({
          branchId: branch.id,
          branchName: branch.name,
          operatingDay: closedDay,
          status: "skipped",
          reason: "ไม่พบสาขา",
        });
        continue;
      }

      const recipients = await recipientsForBrand(branch.brandId);
      const text = formatBranchDaySummaryMessage(summary);

      if (recipients.length === 0) {
        result.skipped += 1;
        result.details.push({
          branchId: branch.id,
          branchName: branch.name,
          operatingDay: closedDay,
          status: "skipped",
          reason: "ไม่มีเจ้าของแบรนด์ที่เชื่อม LINE",
          recipients: 0,
        });
        continue;
      }

      const pushResults = await Promise.allSettled(
        recipients.map((r) => linePushText(r.lineUserId, text)),
      );
      const okCount = pushResults.filter(
        (r) => r.status === "fulfilled" && r.value.ok,
      ).length;

      if (okCount === 0) {
        result.errors.push(`${branch.name}: ส่งไม่สำเร็จทั้งหมด`);
        result.details.push({
          branchId: branch.id,
          branchName: branch.name,
          operatingDay: closedDay,
          status: "error",
          recipients: 0,
          reason: "ส่งไม่สำเร็จ",
        });
        continue;
      }

      await prisma.lineDailySummaryLog.upsert({
        where: {
          branchId_operatingDay: {
            branchId: branch.id,
            operatingDay: businessDate,
          },
        },
        create: {
          branchId: branch.id,
          operatingDay: businessDate,
          recipientCount: okCount,
        },
        update: { sentAt: new Date(), recipientCount: okCount },
      });

      result.sent += 1;
      result.details.push({
        branchId: branch.id,
        branchName: branch.name,
        operatingDay: closedDay,
        status: "sent",
        recipients: okCount,
        reason:
          okCount < recipients.length
            ? `ส่งได้ ${okCount}/${recipients.length}`
            : undefined,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`${branch.name}: ${msg}`);
      result.details.push({
        branchId: branch.id,
        branchName: branch.name,
        operatingDay: closedDay,
        status: "error",
        reason: msg,
      });
    }
  }

  return result;
}

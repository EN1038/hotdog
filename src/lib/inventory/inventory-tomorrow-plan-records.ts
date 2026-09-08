import { BranchTomorrowPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isManualMenuItemCode,
  resolveMenuItemProductCode,
} from "@/lib/inventory/inventory-menu-code";
import {
  mergeTomorrowPlanRounds,
  type TomorrowPlanQtyDiff,
} from "@/lib/inventory/inventory-tomorrow-plan-merge";
import {
  getTomorrowPlanHeaderDb,
  getTomorrowPlanLineDb,
  legacyPlanId,
  parseLegacyPlanId,
} from "@/lib/inventory/inventory-tomorrow-plan-prisma";
import { compareThaiText } from "@/lib/thai-sort";

export const TOMORROW_PLAN_STATUS_LABELS: Record<
  BranchTomorrowPlanStatus,
  string
> = {
  CONFIRMED: "ยืนยันแล้ว",
  CANCELLED: "ยกเลิก",
};

export type TomorrowPlanListItem = {
  id: string;
  planDate: string;
  roundNo: number;
  status: BranchTomorrowPlanStatus;
  statusLabel: string;
  note: string | null;
  confirmedAt: string;
  updatedAt: string;
  confirmedByUsername: string | null;
  lineCount: number;
  totalConfirmedQty: number;
  totalSuggestedQty: number;
};

export type TomorrowPlanDayListItem = {
  planDate: string;
  roundCount: number;
  confirmedRoundCount: number;
  status: BranchTomorrowPlanStatus;
  statusLabel: string;
  lineCount: number;
  totalConfirmedQty: number;
  confirmedAt: string;
  confirmedByUsername: string | null;
  rounds: TomorrowPlanListItem[];
};

export type TomorrowPlanDetailLine = {
  id: string;
  menuItemId: string;
  productCode: string;
  hasManualItemCode: boolean;
  name: string;
  category: string | null;
  imageUrl: string | null;
  confirmedQty: number;
  suggestedQty: number;
  parStock: number;
  availableStock: number;
  confirmedAt: string;
  lastRoundNo?: number;
  changedFromPrev?: boolean;
  prevQty?: number | null;
};

export type TomorrowPlanDetail = TomorrowPlanListItem & {
  branchName: string;
  lines: TomorrowPlanDetailLine[];
};

export type TomorrowPlanDayDetail = {
  planDate: string;
  branchName: string;
  rounds: TomorrowPlanDetail[];
  effectiveLines: TomorrowPlanDetailLine[];
  diffs: TomorrowPlanQtyDiff[];
  lineCount: number;
  totalConfirmedQty: number;
  roundCount: number;
  confirmedRoundCount: number;
};

type PlanHeaderRow = {
  id: string;
  planDate: string;
  roundNo: number;
  status: BranchTomorrowPlanStatus;
  note: string | null;
  confirmedAt: Date;
  updatedAt: Date;
  confirmedByAdmin: { username: string } | null;
  lines: { confirmedQty: number; suggestedQty: number }[];
};

function mapListItem(plan: PlanHeaderRow): TomorrowPlanListItem {
  return {
    id: plan.id,
    planDate: plan.planDate,
    roundNo: plan.roundNo ?? 1,
    status: plan.status,
    statusLabel: TOMORROW_PLAN_STATUS_LABELS[plan.status],
    note: plan.note,
    confirmedAt: plan.confirmedAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    confirmedByUsername: plan.confirmedByAdmin?.username ?? null,
    lineCount: plan.lines.length,
    totalConfirmedQty: plan.lines.reduce((s, l) => s + l.confirmedQty, 0),
    totalSuggestedQty: plan.lines.reduce((s, l) => s + l.suggestedQty, 0),
  };
}

function sortDetailLines(lines: TomorrowPlanDetailLine[]): TomorrowPlanDetailLine[] {
  return [...lines].sort(
    (a, b) =>
      compareThaiText(a.productCode, b.productCode) ||
      compareThaiText(a.name, b.name),
  );
}

function mapDetailLine(line: {
  id: string;
  menuItemId: string;
  confirmedQty: number;
  suggestedQty: number;
  parStock: number;
  availableStock: number;
  confirmedAt: Date;
  menuItem: {
    id: string;
    name: string;
    imageUrl: string | null;
    itemCode: string | null;
    category: { name: string } | null;
  };
}): TomorrowPlanDetailLine {
  return {
    id: line.id,
    menuItemId: line.menuItemId,
    productCode: resolveMenuItemProductCode({
      id: line.menuItem.id,
      itemCode: line.menuItem.itemCode,
    }),
    hasManualItemCode: isManualMenuItemCode({
      itemCode: line.menuItem.itemCode,
    }),
    name: line.menuItem.name,
    category: line.menuItem.category?.name ?? null,
    imageUrl: line.menuItem.imageUrl,
    confirmedQty: line.confirmedQty,
    suggestedQty: line.suggestedQty,
    parStock: line.parStock,
    availableStock: line.availableStock,
    confirmedAt: line.confirmedAt.toISOString(),
  };
}

function fallbackDetailLine(line: {
  id: string;
  menuItemId: string;
  confirmedQty: number;
  suggestedQty: number;
  parStock: number;
  availableStock: number;
  confirmedAt: Date;
}): TomorrowPlanDetailLine {
  return {
    id: line.id,
    menuItemId: line.menuItemId,
    productCode: line.menuItemId.slice(-8).toUpperCase(),
    hasManualItemCode: false,
    name: "เมนู",
    category: null,
    imageUrl: null,
    confirmedQty: line.confirmedQty,
    suggestedQty: line.suggestedQty,
    parStock: line.parStock,
    availableStock: line.availableStock,
    confirmedAt: line.confirmedAt.toISOString(),
  };
}

function groupRoundsIntoDays(
  rounds: TomorrowPlanListItem[],
): TomorrowPlanDayListItem[] {
  const byDate = new Map<string, TomorrowPlanListItem[]>();
  for (const round of rounds) {
    const list = byDate.get(round.planDate) ?? [];
    list.push(round);
    byDate.set(round.planDate, list);
  }

  const days: TomorrowPlanDayListItem[] = [];
  for (const [planDate, dayRounds] of byDate) {
    const sorted = [...dayRounds].sort(
      (a, b) =>
        a.roundNo - b.roundNo || a.confirmedAt.localeCompare(b.confirmedAt),
    );
    const confirmed = sorted.filter((r) => r.status === "CONFIRMED");
    const latest = sorted.reduce((a, b) =>
      a.confirmedAt >= b.confirmedAt ? a : b,
    );
    const status: BranchTomorrowPlanStatus =
      confirmed.length > 0 ? "CONFIRMED" : "CANCELLED";

    days.push({
      planDate,
      roundCount: sorted.length,
      confirmedRoundCount: confirmed.length,
      status,
      statusLabel: TOMORROW_PLAN_STATUS_LABELS[status],
      lineCount: 0,
      totalConfirmedQty: 0,
      confirmedAt: latest.confirmedAt,
      confirmedByUsername: latest.confirmedByUsername,
      rounds: sorted,
    });
  }

  days.sort(
    (a, b) =>
      b.planDate.localeCompare(a.planDate) ||
      b.confirmedAt.localeCompare(a.confirmedAt),
  );
  return days;
}

async function listTomorrowPlansFromLines(input: {
  branchId: string;
  q?: string;
}): Promise<TomorrowPlanListItem[]> {
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) return [];

  const q = input.q?.trim().toLowerCase() ?? "";
  const lines = await lineDb.findMany({
    where: { branchId: input.branchId },
    select: {
      id: true,
      planId: true,
      planDate: true,
      confirmedQty: true,
      suggestedQty: true,
      confirmedAt: true,
      menuItem: {
        select: { name: true, itemCode: true },
      },
    },
    orderBy: [{ planDate: "desc" }, { confirmedAt: "desc" }],
  });

  const groups = new Map<
    string,
    {
      planId: string | null;
      planDate: string;
      lines: typeof lines;
    }
  >();

  for (const line of lines) {
    if (q) {
      const hay = `${line.planDate} ${line.menuItem.name} ${line.menuItem.itemCode ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const key = line.planId ?? line.planDate;
    const group = groups.get(key) ?? {
      planId: line.planId,
      planDate: line.planDate,
      lines: [],
    };
    group.lines.push(line);
    groups.set(key, group);
  }

  const items: TomorrowPlanListItem[] = [];
  for (const group of groups.values()) {
    const confirmedAt = group.lines.reduce(
      (latest, row) => (row.confirmedAt > latest ? row.confirmedAt : latest),
      group.lines[0]!.confirmedAt,
    );
    items.push({
      id: group.planId ?? legacyPlanId(input.branchId, group.planDate),
      planDate: group.planDate,
      roundNo: 1,
      status: "CONFIRMED",
      statusLabel: TOMORROW_PLAN_STATUS_LABELS.CONFIRMED,
      note: null,
      confirmedAt: confirmedAt.toISOString(),
      updatedAt: confirmedAt.toISOString(),
      confirmedByUsername: null,
      lineCount: group.lines.length,
      totalConfirmedQty: group.lines.reduce((s, l) => s + l.confirmedQty, 0),
      totalSuggestedQty: group.lines.reduce((s, l) => s + l.suggestedQty, 0),
    });
  }

  items.sort(
    (a, b) =>
      b.planDate.localeCompare(a.planDate) ||
      b.confirmedAt.localeCompare(a.confirmedAt),
  );
  return items;
}

async function enrichDaysWithEffective(
  branchId: string,
  days: TomorrowPlanDayListItem[],
): Promise<TomorrowPlanDayListItem[]> {
  if (days.length === 0) return days;
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) return days;

  const planIds = days.flatMap((d) =>
    d.rounds.filter((r) => r.status === "CONFIRMED").map((r) => r.id),
  );
  if (planIds.length === 0) return days;

  const lines = await lineDb.findMany({
    where: {
      branchId,
      planId: { in: planIds.filter((id) => !id.startsWith("legacy:")) },
    },
    select: {
      planId: true,
      menuItemId: true,
      confirmedQty: true,
      suggestedQty: true,
      parStock: true,
      availableStock: true,
      confirmedAt: true,
    },
  });
  const linesByPlan = new Map<string, typeof lines>();
  for (const line of lines) {
    if (!line.planId) continue;
    const list = linesByPlan.get(line.planId) ?? [];
    list.push(line);
    linesByPlan.set(line.planId, list);
  }

  return days.map((day) => {
    const confirmed = day.rounds.filter((r) => r.status === "CONFIRMED");
    const { effectiveLines } = mergeTomorrowPlanRounds(
      confirmed.map((r) => ({
        roundNo: r.roundNo,
        status: r.status,
        confirmedAt: r.confirmedAt,
        lines: (linesByPlan.get(r.id) ?? []).map((line) => ({
          menuItemId: line.menuItemId,
          confirmedQty: line.confirmedQty,
          suggestedQty: line.suggestedQty,
          parStock: line.parStock,
          availableStock: line.availableStock,
          confirmedAt: line.confirmedAt.toISOString(),
        })),
      })),
    );
    return {
      ...day,
      lineCount: effectiveLines.length,
      totalConfirmedQty: effectiveLines.reduce(
        (s, l) => s + l.confirmedQty,
        0,
      ),
    };
  });
}

export async function listTomorrowPlans(input: {
  branchId: string;
  q?: string;
  status?: BranchTomorrowPlanStatus | "ALL";
}): Promise<{ days: TomorrowPlanDayListItem[]; items: TomorrowPlanListItem[] }> {
  const q = input.q?.trim() ?? "";
  const status =
    input.status && input.status !== "ALL" ? input.status : undefined;

  const headerDb = getTomorrowPlanHeaderDb();
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) {
    return { days: [], items: [] };
  }

  let rounds: TomorrowPlanListItem[] = [];

  if (headerDb) {
    try {
      const plans = await headerDb.findMany({
        where: {
          branchId: input.branchId,
          ...(status ? { status } : {}),
          ...(q
            ? {
                OR: [
                  { planDate: { contains: q } },
                  { note: { contains: q } },
                  {
                    lines: {
                      some: {
                        menuItem: {
                          OR: [
                            { name: { contains: q, mode: "insensitive" } },
                            { itemCode: { contains: q, mode: "insensitive" } },
                          ],
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        include: {
          confirmedByAdmin: { select: { username: true } },
          lines: { select: { confirmedQty: true, suggestedQty: true } },
        },
        orderBy: [
          { planDate: "desc" },
          { roundNo: "asc" },
          { confirmedAt: "desc" },
        ],
        take: 500,
      });

      if (plans.length > 0) {
        rounds = plans.map((plan) =>
          mapListItem({
            ...plan,
            roundNo: plan.roundNo ?? 1,
          }),
        );
      }
    } catch (error) {
      console.error("[tomorrow-plans] header list failed", error);
    }
  }

  if (rounds.length === 0) {
    rounds = await listTomorrowPlansFromLines({
      branchId: input.branchId,
      q,
    });
    if (status) {
      rounds = rounds.filter((row) => row.status === status);
    }
  }

  let days = groupRoundsIntoDays(rounds);
  days = await enrichDaysWithEffective(input.branchId, days);

  return { days, items: rounds };
}

type HeaderRow = {
  id: string;
  planDate: string;
  roundNo?: number;
  status: BranchTomorrowPlanStatus;
  note: string | null;
  confirmedAt: Date;
  updatedAt: Date;
  confirmedByAdmin: { username: string } | null;
};

export async function getTomorrowPlanDetail(input: {
  branchId: string;
  planId: string;
  planDate?: string;
}): Promise<TomorrowPlanDetail> {
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) throw new Error("NOT_FOUND");

  const legacy = parseLegacyPlanId(input.planId);
  const headerDb = getTomorrowPlanHeaderDb();

  let header: HeaderRow | null = null;
  if (!legacy && headerDb) {
    try {
      header = await headerDb.findFirst({
        where: { id: input.planId, branchId: input.branchId },
        include: { confirmedByAdmin: { select: { username: true } } },
      });
    } catch (error) {
      console.error("[tomorrow-plans] header by id failed", error);
      try {
        const plain = await headerDb.findFirst({
          where: { id: input.planId, branchId: input.branchId },
        });
        header = plain ? { ...plain, confirmedByAdmin: null } : null;
      } catch (plainError) {
        console.error("[tomorrow-plans] header by id (plain) failed", plainError);
      }
    }
  }

  const planDate =
    legacy?.planDate ?? header?.planDate ?? input.planDate ?? undefined;
  // Scope lines to this round only (do not OR with planDate — that mixes rounds).
  const lineWhere = legacy
    ? { branchId: legacy.branchId, planDate: legacy.planDate }
    : { branchId: input.branchId, planId: header?.id ?? input.planId };

  let rawLines: Array<{
    id: string;
    menuItemId: string;
    confirmedQty: number;
    suggestedQty: number;
    parStock: number;
    availableStock: number;
    confirmedAt: Date;
    planDate: string;
    menuItem?: Parameters<typeof mapDetailLine>[0]["menuItem"];
  }> = [];

  try {
    rawLines = await lineDb.findMany({
      where: lineWhere,
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            itemCode: true,
            category: { select: { name: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error("[tomorrow-plans] lines with menu failed", error);
    try {
      rawLines = await lineDb.findMany({ where: lineWhere });
    } catch (plainError) {
      console.error("[tomorrow-plans] lines plain failed", plainError);
      if (legacy && planDate) {
        rawLines = await lineDb.findMany({
          where: { branchId: input.branchId, planDate },
        });
      }
    }
  }

  if (!header && rawLines.length === 0) throw new Error("NOT_FOUND");

  const confirmedAt =
    header?.confirmedAt ??
    rawLines.reduce(
      (latest, row) => (row.confirmedAt > latest ? row.confirmedAt : latest),
      rawLines[0]?.confirmedAt ?? new Date(),
    );

  const branchName = await prisma.branch
    .findUnique({
      where: { id: input.branchId },
      select: { name: true },
    })
    .then((row) => row?.name ?? "สาขา")
    .catch(() => "สาขา");

  const headerRow: PlanHeaderRow = {
    id: header?.id ?? input.planId,
    planDate: planDate ?? rawLines[0]?.planDate ?? "",
    roundNo: header?.roundNo ?? 1,
    status: header?.status ?? "CONFIRMED",
    note: header?.note ?? null,
    confirmedAt,
    updatedAt: header?.updatedAt ?? confirmedAt,
    confirmedByAdmin: header?.confirmedByAdmin ?? null,
    lines: rawLines.map((line) => ({
      confirmedQty: line.confirmedQty,
      suggestedQty: line.suggestedQty,
    })),
  };

  const detail: TomorrowPlanDetail = {
    ...mapListItem(headerRow),
    branchName,
    lines: sortDetailLines(
      rawLines.map((line) =>
        line.menuItem
          ? mapDetailLine(line as Parameters<typeof mapDetailLine>[0])
          : fallbackDetailLine(line),
      ),
    ),
  };

  // Highlight lines that differ from the previous confirmed round on the same day.
  if (headerDb && detail.planDate && detail.status === "CONFIRMED") {
    try {
      const prevHeader = await headerDb.findFirst({
        where: {
          branchId: input.branchId,
          planDate: detail.planDate,
          status: "CONFIRMED",
          roundNo: { lt: detail.roundNo },
        },
        orderBy: { roundNo: "desc" },
        select: { id: true },
      });
      if (prevHeader) {
        const prevLines = await lineDb.findMany({
          where: { planId: prevHeader.id },
          select: { menuItemId: true, confirmedQty: true },
        });
        const prevByMenu = new Map(
          prevLines.map((l) => [l.menuItemId, l.confirmedQty]),
        );
        for (const line of detail.lines) {
          const prevQty = prevByMenu.get(line.menuItemId);
          if (prevQty == null) {
            line.changedFromPrev = true;
            line.prevQty = null;
          } else if (prevQty !== line.confirmedQty) {
            line.changedFromPrev = true;
            line.prevQty = prevQty;
          } else {
            line.changedFromPrev = false;
            line.prevQty = prevQty;
          }
        }
      }
    } catch (error) {
      console.error("[tomorrow-plans] prev round annotate failed", error);
    }
  }

  return detail;
}

export async function getTomorrowPlanDay(input: {
  branchId: string;
  planDate: string;
}): Promise<TomorrowPlanDayDetail> {
  const headerDb = getTomorrowPlanHeaderDb();
  if (!headerDb) throw new Error("NOT_FOUND");

  const headers = await headerDb.findMany({
    where: { branchId: input.branchId, planDate: input.planDate },
    select: { id: true },
    orderBy: [{ roundNo: "asc" }, { confirmedAt: "asc" }],
  });
  if (headers.length === 0) throw new Error("NOT_FOUND");

  const rounds: TomorrowPlanDetail[] = [];
  for (const header of headers) {
    rounds.push(
      await getTomorrowPlanDetail({
        branchId: input.branchId,
        planId: header.id,
        planDate: input.planDate,
      }),
    );
  }

  const { effectiveLines: merged, diffs } = mergeTomorrowPlanRounds(
    rounds.map((r) => ({
      roundNo: r.roundNo,
      status: r.status,
      confirmedAt: r.confirmedAt,
      lines: r.lines.map((line) => ({
        id: line.id,
        menuItemId: line.menuItemId,
        productCode: line.productCode,
        hasManualItemCode: line.hasManualItemCode,
        name: line.name,
        category: line.category,
        imageUrl: line.imageUrl,
        confirmedQty: line.confirmedQty,
        suggestedQty: line.suggestedQty,
        parStock: line.parStock,
        availableStock: line.availableStock,
        confirmedAt: line.confirmedAt,
      })),
    })),
  );

  const diffByMenu = new Map(diffs.map((d) => [d.menuItemId, d]));
  const effectiveLines = sortDetailLines(
    merged.map((line) => {
      const diff = diffByMenu.get(line.menuItemId);
      return {
        id: line.id ?? `${line.menuItemId}:${line.lastRoundNo}`,
        menuItemId: line.menuItemId,
        productCode: line.productCode ?? "",
        hasManualItemCode: line.hasManualItemCode ?? false,
        name: line.name ?? "",
        category: line.category ?? null,
        imageUrl: line.imageUrl ?? null,
        confirmedQty: line.confirmedQty,
        suggestedQty: line.suggestedQty,
        parStock: line.parStock,
        availableStock: line.availableStock,
        confirmedAt: line.confirmedAt ?? "",
        lastRoundNo: line.lastRoundNo,
        changedFromPrev: Boolean(diff),
        prevQty: diff?.fromQty ?? null,
      };
    }),
  );

  // Annotate each round's lines with change vs previous confirmed round.
  const confirmedRounds = rounds
    .filter((r) => r.status === "CONFIRMED")
    .sort((a, b) => a.roundNo - b.roundNo);
  for (let i = 0; i < confirmedRounds.length; i++) {
    const round = confirmedRounds[i]!;
    const prev = confirmedRounds[i - 1];
    const prevByMenu = new Map(
      (prev?.lines ?? []).map((l) => [l.menuItemId, l.confirmedQty]),
    );
    for (const line of round.lines) {
      if (!prev) {
        line.changedFromPrev = false;
        line.prevQty = null;
        continue;
      }
      const prevQty = prevByMenu.get(line.menuItemId);
      if (prevQty == null) {
        line.changedFromPrev = true;
        line.prevQty = null;
      } else if (prevQty !== line.confirmedQty) {
        line.changedFromPrev = true;
        line.prevQty = prevQty;
      } else {
        line.changedFromPrev = false;
        line.prevQty = prevQty;
      }
    }
  }

  const confirmedRoundCount = rounds.filter(
    (r) => r.status === "CONFIRMED",
  ).length;

  return {
    planDate: input.planDate,
    branchName: rounds[0]?.branchName ?? "สาขา",
    rounds,
    effectiveLines,
    diffs,
    lineCount: effectiveLines.length,
    totalConfirmedQty: effectiveLines.reduce((s, l) => s + l.confirmedQty, 0),
    roundCount: rounds.length,
    confirmedRoundCount,
  };
}

export async function updateTomorrowPlan(input: {
  branchId: string;
  planId: string;
  adminId?: string;
  status?: BranchTomorrowPlanStatus;
  note?: string | null;
  items?: Array<{ lineId: string; confirmedQty: number }>;
}): Promise<TomorrowPlanDetail> {
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) throw new Error("NOT_FOUND");

  if (input.items) {
    for (const item of input.items) {
      if (!Number.isInteger(item.confirmedQty) || item.confirmedQty < 0) {
        throw new Error("INVALID_QTY");
      }
    }
  }

  const legacy = parseLegacyPlanId(input.planId);
  const headerDb = getTomorrowPlanHeaderDb();
  if (!legacy && headerDb) {
    const existing = await headerDb.findFirst({
      where: { id: input.planId, branchId: input.branchId },
      select: { id: true },
    });
    if (!existing) throw new Error("NOT_FOUND");

    await headerDb.update({
      where: { id: input.planId },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.adminId ? { confirmedByAdminId: input.adminId } : {}),
      },
    });
  }

  if (input.items) {
    for (const item of input.items) {
      const line = await lineDb.findFirst({
        where: {
          id: item.lineId,
          branchId: input.branchId,
          ...(legacy
            ? { planDate: legacy.planDate }
            : { planId: input.planId }),
        },
      });
      if (!line) throw new Error("LINE_NOT_FOUND");
      await lineDb.update({
        where: { id: item.lineId },
        data: {
          confirmedQty: item.confirmedQty,
          confirmedByAdminId: input.adminId ?? null,
        },
      });
    }
  }

  return getTomorrowPlanDetail({ branchId: input.branchId, planId: input.planId });
}

export async function deleteTomorrowPlan(input: {
  branchId: string;
  planId: string;
}): Promise<void> {
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) throw new Error("NOT_FOUND");

  const legacy = parseLegacyPlanId(input.planId);
  const headerDb = getTomorrowPlanHeaderDb();

  if (legacy) {
    await lineDb.deleteMany({
      where: { branchId: legacy.branchId, planDate: legacy.planDate },
    });
    if (headerDb) {
      await headerDb
        .deleteMany({
          where: { branchId: legacy.branchId, planDate: legacy.planDate },
        })
        .catch(() => {});
    }
    return;
  }

  const detail = await getTomorrowPlanDetail({
    branchId: input.branchId,
    planId: input.planId,
  }).catch(() => null);
  if (!detail) throw new Error("NOT_FOUND");

  // Delete only this round's lines + header (not the whole day).
  await lineDb.deleteMany({
    where: {
      branchId: input.branchId,
      planId: input.planId,
    },
  });

  if (!headerDb) return;

  const header = await headerDb.findFirst({
    where: { id: input.planId, branchId: input.branchId },
    select: { id: true },
  });
  if (header) {
    await headerDb.delete({ where: { id: header.id } });
  }
}

export async function deleteTomorrowPlanLine(input: {
  branchId: string;
  planId: string;
  lineId: string;
}): Promise<TomorrowPlanDetail | null> {
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) throw new Error("NOT_FOUND");

  const legacy = parseLegacyPlanId(input.planId);
  const line = await lineDb.findFirst({
    where: {
      id: input.lineId,
      branchId: input.branchId,
      ...(legacy ? { planDate: legacy.planDate } : { planId: input.planId }),
    },
    select: { id: true },
  });
  if (!line) throw new Error("LINE_NOT_FOUND");
  await lineDb.delete({ where: { id: input.lineId } });

  const remaining = legacy
    ? await lineDb.count({
        where: { branchId: input.branchId, planDate: legacy.planDate },
      })
    : await lineDb.count({ where: { planId: input.planId } });

  if (remaining === 0) {
    const headerDb = getTomorrowPlanHeaderDb();
    if (!legacy && headerDb) {
      await headerDb.delete({ where: { id: input.planId } }).catch(() => {});
    }
    return null;
  }
  return getTomorrowPlanDetail({ branchId: input.branchId, planId: input.planId });
}

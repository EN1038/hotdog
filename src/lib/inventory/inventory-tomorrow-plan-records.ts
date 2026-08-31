import { BranchTomorrowPlanStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isManualMenuItemCode,
  resolveMenuItemProductCode,
} from "@/lib/inventory/inventory-menu-code";
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
};

export type TomorrowPlanDetail = TomorrowPlanListItem & {
  branchName: string;
  lines: TomorrowPlanDetailLine[];
};

type PlanHeaderRow = {
  id: string;
  planDate: string;
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
    brandProduct: { sku: string | null; barcode: string | null } | null;
  };
}): TomorrowPlanDetailLine {
  return {
    id: line.id,
    menuItemId: line.menuItemId,
    productCode: resolveMenuItemProductCode({
      id: line.menuItem.id,
      itemCode: line.menuItem.itemCode,
      brandProduct: line.menuItem.brandProduct,
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
      id:
        group.planId ??
        legacyPlanId(input.branchId, group.planDate),
      planDate: group.planDate,
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

export async function listTomorrowPlans(input: {
  branchId: string;
  q?: string;
  status?: BranchTomorrowPlanStatus | "ALL";
}): Promise<{ items: TomorrowPlanListItem[] }> {
  const q = input.q?.trim() ?? "";
  const status =
    input.status && input.status !== "ALL" ? input.status : undefined;

  const headerDb = getTomorrowPlanHeaderDb();
  const lineDb = getTomorrowPlanLineDb();
  if (!lineDb) {
    return { items: [] };
  }

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
      orderBy: [{ planDate: "desc" }, { confirmedAt: "desc" }],
      take: 200,
      });

      if (plans.length > 0) {
        return { items: plans.map(mapListItem) };
      }
    } catch (error) {
      console.error("[tomorrow-plans] header list failed", error);
    }
  }

  const items = await listTomorrowPlansFromLines({
    branchId: input.branchId,
    q,
  });
  return {
    items: status ? items.filter((row) => row.status === status) : items,
  };
}

type HeaderRow = {
  id: string;
  planDate: string;
  status: BranchTomorrowPlanStatus;
  note: string | null;
  confirmedAt: Date;
  updatedAt: Date;
  confirmedByAdmin: { username: string } | null;
};

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
        header = await headerDb.findFirst({
          where: { id: input.planId, branchId: input.branchId },
        });
      } catch (plainError) {
        console.error("[tomorrow-plans] header by id (plain) failed", plainError);
      }
    }
  }

  const planDate =
    legacy?.planDate ?? header?.planDate ?? input.planDate ?? undefined;
  const lineWhere = legacy
    ? { branchId: legacy.branchId, planDate: legacy.planDate }
    : planDate
      ? {
          branchId: input.branchId,
          OR: [{ planId: header?.id ?? input.planId }, { planDate }],
        }
      : { branchId: input.branchId, planId: input.planId };

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
            brandProduct: { select: { sku: true, barcode: true } },
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
      if (planDate) {
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

  return {
    ...mapListItem(headerRow),
    branchName,
    lines: sortDetailLines(
      rawLines.map((line) =>
        line.menuItem ? mapDetailLine(line as Parameters<typeof mapDetailLine>[0]) : fallbackDetailLine(line),
      ),
    ),
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
  if (legacy) {
    await lineDb.deleteMany({
      where: { branchId: legacy.branchId, planDate: legacy.planDate },
    });
    return;
  }

  const headerDb = getTomorrowPlanHeaderDb();
  if (headerDb) {
    const existing = await headerDb.findFirst({
      where: { id: input.planId, branchId: input.branchId },
      select: { id: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    await headerDb.delete({ where: { id: input.planId } });
    return;
  }

  await lineDb.deleteMany({
    where: { branchId: input.branchId, planId: input.planId },
  });
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

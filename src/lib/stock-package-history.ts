import { prisma } from "@/lib/db";
import { isBangkokDateKey } from "@/lib/constants";
import { stockLabelQrPayload } from "@/lib/stock-label";
import type {
  PackageHistoryBatch,
  PackageHistoryKind,
  PackageHistoryLine,
} from "@/lib/stock-package-history-types";

export {
  PACKAGE_HISTORY_KINDS,
  PACKAGE_HISTORY_KIND_LABEL,
  isPackageHistoryKind,
  type PackageHistoryKind,
  type PackageHistoryLine,
  type PackageHistoryBatch,
} from "@/lib/stock-package-history-types";

function bangkokDayRange(from: string, to: string) {
  const startKey = from <= to ? from : to;
  const endKey = from <= to ? to : from;
  return {
    start: new Date(`${startKey}T00:00:00.000+07:00`),
    end: new Date(`${endKey}T23:59:59.999+07:00`),
  };
}

function matchesQuery(batch: PackageHistoryBatch, q: string): boolean {
  if (!q) return true;
  const hay = [
    batch.documentNo ?? "",
    batch.brandName ?? "",
    batch.sourceBranchName ?? "",
    batch.createdByStaff?.name ?? "",
    ...batch.lines.map(
      (l) => `${l.name} ${l.productCode} ${l.lotNumber} ${l.labelCode}`,
    ),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export async function loadPackageHistoryBatches(input: {
  branchId: string;
  from: string;
  to: string;
  kind: PackageHistoryKind;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  batches: PackageHistoryBatch[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}> {
  const { start, end } = bangkokDayRange(input.from, input.to);
  const limit = Math.min(80, Math.max(10, input.limit ?? 40));
  const offset = Math.max(0, input.offset ?? 0);
  const q = input.q?.trim().toLowerCase() ?? "";

  const labels = await prisma.stockLabel.findMany({
    where: {
      branchId: input.branchId,
      createdAt: { gte: start, lte: end },
      ...(input.kind === "out" ? { status: "CONSUMED" } : {}),
    },
    include: {
      createdByStaff: { select: { id: true, name: true } },
      menuItem: { select: { imageUrl: true } },
      nonMenuItem: { select: { imageUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const batchMap = new Map<string, typeof labels>();
  for (const label of labels) {
    const key = label.batchId ?? label.documentNo ?? label.id;
    const list = batchMap.get(key) ?? [];
    list.push(label);
    batchMap.set(key, list);
  }

  const batches: PackageHistoryBatch[] = [];
  for (const [batchKey, rows] of batchMap) {
    const sorted = [...rows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const first = sorted[0];
    const consumedCount = sorted.filter((r) => r.status === "CONSUMED").length;

    if (input.kind === "out" && consumedCount === 0) continue;

    const lines: PackageHistoryLine[] = sorted.map((row) => ({
      id: row.id,
      labelId: row.id,
      labelCode: row.labelCode,
      lotNumber: row.lotNumber,
      name: row.productName,
      productCode: row.productCode,
      imageUrl:
        row.menuItem?.imageUrl ?? row.nonMenuItem?.imageUrl ?? null,
      quantity: row.quantity,
      unit: row.unit,
      status: row.status,
      qrPayload: stockLabelQrPayload({
        id: row.id,
        labelCode: row.labelCode,
      }),
    }));

    batches.push({
      id: batchKey,
      batchId: first.batchId ?? batchKey,
      documentNo: first.documentNo,
      label: input.kind === "out" ? "จ่ายรายการ" : "รับเข้ารายการ",
      kind: consumedCount === sorted.length && sorted.length > 0 ? "out" : "in",
      createdAt: first.createdAt.toISOString(),
      producedAt: first.producedAt?.toISOString() ?? null,
      brandName: first.brandName,
      sourceBranchName: first.sourceBranchName,
      createdByStaff: first.createdByStaff
        ? {
            id: first.createdByStaff.id,
            name: first.createdByStaff.name ?? "—",
          }
        : null,
      packageCount: sorted.length,
      totalQty: sorted.reduce((s, r) => s + r.quantity, 0),
      lines,
    });
  }

  batches.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const filtered = batches.filter((b) => matchesQuery(b, q));
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    batches: page,
    total,
    hasMore,
    nextOffset: offset + page.length,
  };
}

export async function loadPackageBatchById(input: {
  branchId: string;
  batchId: string;
}): Promise<PackageHistoryBatch | null> {
  if (!input.batchId.trim()) return null;

  const labels = await prisma.stockLabel.findMany({
    where: {
      branchId: input.branchId,
      OR: [{ batchId: input.batchId }, { id: input.batchId }],
    },
    include: {
      createdByStaff: { select: { id: true, name: true } },
      menuItem: { select: { imageUrl: true } },
      nonMenuItem: { select: { imageUrl: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (labels.length === 0) return null;

  const first = labels[0];
  const lines: PackageHistoryLine[] = labels.map((row) => ({
    id: row.id,
    labelId: row.id,
    labelCode: row.labelCode,
    lotNumber: row.lotNumber,
    name: row.productName,
    productCode: row.productCode,
    imageUrl: row.menuItem?.imageUrl ?? row.nonMenuItem?.imageUrl ?? null,
    quantity: row.quantity,
    unit: row.unit,
    status: row.status,
    qrPayload: stockLabelQrPayload({
      id: row.id,
      labelCode: row.labelCode,
    }),
  }));

  return {
    id: first.batchId ?? first.id,
    batchId: first.batchId ?? first.id,
    documentNo: first.documentNo,
    label: "รับเข้ารายการ",
    kind: "in",
    createdAt: first.createdAt.toISOString(),
    producedAt: first.producedAt?.toISOString() ?? null,
    brandName: first.brandName,
    sourceBranchName: first.sourceBranchName,
    createdByStaff: first.createdByStaff
      ? {
          id: first.createdByStaff.id,
          name: first.createdByStaff.name ?? "—",
        }
      : null,
    packageCount: labels.length,
    totalQty: labels.reduce((s, r) => s + r.quantity, 0),
    lines,
  };
}

export function assertPackageHistoryDates(from: string, to: string) {
  if (!isBangkokDateKey(from) || !isBangkokDateKey(to)) {
    throw new Error("กรุณาระบุช่วงวันที่ (from/to เป็น YYYY-MM-DD)");
  }
}

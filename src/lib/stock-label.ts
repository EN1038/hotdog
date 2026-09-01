import type { Prisma } from "@prisma/client";
import { bangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatLotNumber } from "@/lib/stock-label-format";
import { normalizeBranchCode } from "@/lib/stock-document-no-format";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

type StockLabelDb = Prisma.TransactionClient | typeof prisma;

function resolveDb(db?: Prisma.TransactionClient): StockLabelDb {
  return db ?? prisma;
}

/** Count labels already created for a branch on a Bangkok calendar day. */
export async function countStockLabelsForDay(
  branchId: string,
  dayKey: string,
  db?: Prisma.TransactionClient,
): Promise<number> {
  if (!DAY_KEY_RE.test(dayKey)) return 0;
  const client = resolveDb(db);
  const start = new Date(`${dayKey}T00:00:00.000+07:00`);
  const end = new Date(`${dayKey}T23:59:59.999+07:00`);
  return client.stockLabel.count({
    where: {
      branchId,
      createdAt: { gte: start, lte: end },
    },
  });
}

/** YYMMDD-#### lot number for a branch on a given day */
export async function generateLotNumber(input: {
  branchId: string;
  producedAt?: string;
  db?: Prisma.TransactionClient;
}): Promise<string> {
  const dayKey = input.producedAt ?? bangkokDateKey();
  const count = await countStockLabelsForDay(
    input.branchId,
    dayKey,
    input.db,
  );
  return formatLotNumber(dayKey, count + 1);
}

/** Unique scannable label code: {branchCode}-{lot}-{seq} */
export async function generateLabelCode(input: {
  branchId: string;
  branchCode: string;
  lotNumber: string;
  db?: Prisma.TransactionClient;
}): Promise<string> {
  const client = resolveDb(input.db);
  const code = normalizeBranchCode(input.branchCode, input.branchId);
  const prefix = `${code}-${input.lotNumber}-`;

  const existing = await client.stockLabel.findMany({
    where: {
      branchId: input.branchId,
      labelCode: { startsWith: prefix },
    },
    select: { labelCode: true },
    take: 500,
  });

  let maxSeq = 0;
  for (const row of existing) {
    const tail = row.labelCode.slice(prefix.length);
    const n = Number(tail);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

/** QR payload encodes label id + code for scan resolution */
export function stockLabelQrPayload(label: {
  id: string;
  labelCode: string;
}): string {
  return `hotdog:label:${label.id}:${label.labelCode}`;
}

export function parseStockLabelQrPayload(
  raw: string,
): { id: string; labelCode: string } | null {
  const trimmed = raw.trim();
  const match = /^hotdog:label:([^:]+):(.+)$/.exec(trimmed);
  if (!match) return null;
  return { id: match[1], labelCode: match[2] };
}

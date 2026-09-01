import { bangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { normalizeBranchCode } from "@/lib/stock-document-no-format";

/** YYMMDD-#### lot number for a branch on a given day */
export async function generateLotNumber(input: {
  branchId: string;
  producedAt?: string;
}): Promise<string> {
  const dayKey = input.producedAt ?? bangkokDateKey();
  const [y, m, d] = dayKey.split("-");
  const prefix = `${y.slice(-2)}${m}${d}`;

  const start = new Date(`${dayKey}T00:00:00.000+07:00`);
  const end = new Date(`${dayKey}T23:59:59.999+07:00`);

  const count = await prisma.stockLabel.count({
    where: {
      branchId: input.branchId,
      createdAt: { gte: start, lte: end },
    },
  });

  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

/** Unique scannable label code: {branchCode}-{lot}-{seq} */
export async function generateLabelCode(input: {
  branchId: string;
  branchCode: string;
  lotNumber: string;
}): Promise<string> {
  const code = normalizeBranchCode(input.branchCode, input.branchId);
  const prefix = `${code}-${input.lotNumber}-`;

  const existing = await prisma.stockLabel.findMany({
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

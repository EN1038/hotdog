import type { Prisma } from "@prisma/client";
import { appAbsoluteUrlOrNull } from "@/lib/app-url";
import { bangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatLotNumber, lotDayPrefix } from "@/lib/stock-label-format";
import { normalizeBranchCode } from "@/lib/stock-document-no-format";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

type StockLabelDb = Prisma.TransactionClient | typeof prisma;

function resolveDb(db?: Prisma.TransactionClient): StockLabelDb {
  return db ?? prisma;
}

function parseLotSequence(lotNumber: string, lotPrefix: string): number {
  if (!lotNumber.startsWith(lotPrefix)) return 0;
  const tail = lotNumber.slice(lotPrefix.length);
  const n = Number(tail);
  return Number.isFinite(n) ? n : 0;
}

function parseLabelCodeSequence(labelCode: string, prefix: string): number {
  if (!labelCode.startsWith(prefix)) return 0;
  const tail = labelCode.slice(prefix.length);
  const n = Number(tail);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Highest LOT sequence already used for a produced calendar day (YYMMDD-####).
 * Uses lotNumber prefix, not createdAt — backdated producedAt stays unique.
 */
export async function maxLotSequenceForProducedDay(
  branchId: string,
  producedDayKey: string,
  db?: Prisma.TransactionClient,
): Promise<number> {
  if (!DAY_KEY_RE.test(producedDayKey)) return 0;
  const client = resolveDb(db);
  const lotPrefix = `${lotDayPrefix(producedDayKey)}-`;
  const latest = await client.stockLabel.findFirst({
    where: {
      branchId,
      lotNumber: { startsWith: lotPrefix },
    },
    orderBy: { lotNumber: "desc" },
    select: { lotNumber: true },
  });
  if (!latest) return 0;
  return parseLotSequence(latest.lotNumber, lotPrefix);
}

/** Used by form preview + LOT generation — returns max sequence for that produced day. */
export async function countStockLabelsForDay(
  branchId: string,
  dayKey: string,
  db?: Prisma.TransactionClient,
): Promise<number> {
  return maxLotSequenceForProducedDay(branchId, dayKey, db);
}

/** YYMMDD-#### lot number for a branch on a given produced day */
export async function generateLotNumber(input: {
  branchId: string;
  producedAt?: string;
  db?: Prisma.TransactionClient;
}): Promise<string> {
  const dayKey = input.producedAt ?? bangkokDateKey();
  const maxSeq = await maxLotSequenceForProducedDay(
    input.branchId,
    dayKey,
    input.db,
  );
  return formatLotNumber(dayKey, maxSeq + 1);
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

  const latest = await client.stockLabel.findFirst({
    where: {
      branchId: input.branchId,
      labelCode: { startsWith: prefix },
    },
    orderBy: { labelCode: "desc" },
    select: { labelCode: true },
  });

  const maxSeq = latest ? parseLabelCodeSequence(latest.labelCode, prefix) : 0;
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

/** QR opens public label page when app URL is configured. */
export function stockLabelQrPayload(label: {
  id: string;
  labelCode: string;
}): string {
  const url = appAbsoluteUrlOrNull(`/label/${label.id}`);
  if (url) return url;
  return `skillsale:label:${label.id}:${label.labelCode}`;
}

export function parseStockLabelQrPayload(
  raw: string,
): { id: string; labelCode: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const labelIdx = parts.findIndex((p) => p.toLowerCase() === "label");
      const id = labelIdx >= 0 ? parts[labelIdx + 1] : parts[parts.length - 1];
      if (id) return { id, labelCode: "" };
    }
  } catch {
    /* not a URL */
  }

  const relativeMatch = /\/label\/([^/?#]+)/i.exec(trimmed);
  if (relativeMatch) {
    return { id: relativeMatch[1], labelCode: "" };
  }

  const schemeMatch = /^(?:skillsale|hotdog):label:([^:]+):(.+)$/.exec(trimmed);
  if (schemeMatch) {
    return { id: schemeMatch[1], labelCode: schemeMatch[2] };
  }

  return null;
}

export function isStockLabelQrPayload(raw: string): boolean {
  return parseStockLabelQrPayload(raw) != null;
}

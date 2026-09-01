import { z } from "zod";
import { prisma } from "@/lib/db";
import { StockError } from "@/lib/stock";
import {
  bangkokMinuteKey,
  documentNoPrefix,
  normalizeBranchCode,
  type StockDocumentKind,
} from "@/lib/stock-document-no-format";

export type { StockDocumentKind } from "@/lib/stock-document-no-format";
export {
  bangkokMinuteKey,
  documentNoPrefix,
  normalizeBranchCode,
  provisionalStockDocumentNo,
} from "@/lib/stock-document-no-format";

/** IN-{branchCode}-YYYYMMDDHHmm-{running} */
export const STOCK_DOCUMENT_NO_REGEX =
  /^(IN|OUT)-[A-Za-z0-9_-]{1,32}-\d{12}-\d{3,}$/;

export const stockDocumentNoSchema = z
  .string()
  .trim()
  .min(16)
  .max(80)
  .regex(STOCK_DOCUMENT_NO_REGEX, "รูปแบบเลขที่เอกสารไม่ถูกต้อง");

function parseRunning(documentNo: string, prefix: string): number | null {
  if (!documentNo.startsWith(`${prefix}-`)) return null;
  const tail = documentNo.slice(prefix.length + 1);
  if (!/^\d+$/.test(tail)) return null;
  return Number(tail);
}

async function collectDocumentNosWithPrefix(prefix: string): Promise<string[]> {
  const like = `${prefix}-%`;
  try {
    const [movements, menuHist, nonMenuHist, stockLabels] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { documentNo: { startsWith: like } },
        select: { documentNo: true },
      }),
      prisma.branchMenuItemStockHistory.findMany({
        where: { documentNo: { startsWith: like } },
        select: { documentNo: true },
      }),
      prisma.branchNonMenuItemHistory.findMany({
        where: { documentNo: { startsWith: like } },
        select: { documentNo: true },
      }),
      prisma.stockLabel.findMany({
        where: { documentNo: { startsWith: like } },
        select: { documentNo: true },
      }),
    ]);
    return [
      ...movements.map((r) => r.documentNo),
      ...menuHist.map((r) => r.documentNo),
      ...nonMenuHist.map((r) => r.documentNo),
      ...stockLabels.map((r) => r.documentNo),
    ].filter((v): v is string => Boolean(v));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/documentNo|Unknown arg|column/i.test(msg)) throw e;
    return [];
  }
}

export async function generateStockDocumentNo(input: {
  kind: StockDocumentKind;
  branchCode: string;
  branchId?: string;
}): Promise<string> {
  const branchCode = normalizeBranchCode(
    input.branchCode,
    input.branchId ?? "branch",
  );
  const minuteKey = bangkokMinuteKey();
  const prefix = documentNoPrefix(input.kind, branchCode, minuteKey);
  const existing = await collectDocumentNosWithPrefix(prefix);
  let maxRun = 0;
  for (const doc of existing) {
    const run = parseRunning(doc, prefix);
    if (run != null && run > maxRun) maxRun = run;
  }
  const next = maxRun + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

export async function assertDocumentNoAvailable(documentNo: string): Promise<void> {
  const trimmed = documentNo.trim();
  try {
    const [movement, menuHist, nonMenuHist, stockLabels] = await Promise.all([
      prisma.stockMovement.findFirst({
        where: { documentNo: trimmed },
        select: { id: true },
      }),
      prisma.branchMenuItemStockHistory.findFirst({
        where: { documentNo: trimmed },
        select: { id: true },
      }),
      prisma.branchNonMenuItemHistory.findFirst({
        where: { documentNo: trimmed },
        select: { id: true },
      }),
      prisma.stockLabel.findFirst({
        where: { documentNo: trimmed },
        select: { id: true },
      }),
    ]);
    if (movement || menuHist || nonMenuHist || stockLabels) {
      throw new StockError("เลขที่เอกสารนี้ถูกใช้แล้ว — กด Gen เพื่อสร้างเลขใหม่");
    }
  } catch (e) {
    if (e instanceof StockError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/documentNo|Unknown arg|column/i.test(msg)) return;
    throw e;
  }
}

export function expectedDocumentKindForAction(
  action: string,
): StockDocumentKind | null {
  if (action === "receive" || action === "stock_in") return "IN";
  if (
    action === "transfer" ||
    action === "damage" ||
    action === "lost" ||
    action === "waste" ||
    action === "sale" ||
    action === "direct" ||
    action === "issue" ||
    action === "out_batch"
  ) {
    return "OUT";
  }
  return null;
}

export async function validateStockDocumentNo(input: {
  documentNo: string;
  action: string;
  skipAvailabilityCheck?: boolean;
}): Promise<string> {
  const doc = stockDocumentNoSchema.parse(input.documentNo.trim());
  const expected = expectedDocumentKindForAction(input.action);
  if (expected && !doc.startsWith(`${expected}-`)) {
    throw new StockError(
      expected === "IN"
        ? "เลขที่เอกสารนำเข้าต้องขึ้นต้นด้วย IN-"
        : "เลขที่เอกสารจ่ายออกต้องขึ้นต้นด้วย OUT-",
    );
  }
  if (!input.skipAvailabilityCheck) {
    await assertDocumentNoAvailable(doc);
  }
  return doc;
}

import { prisma } from "@/lib/db";
import { bangkokDateKey } from "@/lib/constants";
import { normalizeBranchCode } from "@/lib/stock-document-no-format";

function bangkokDayKey(at = new Date()): string {
  return bangkokDateKey(at).replace(/-/g, "");
}

export function purchaseDocumentNoPrefix(
  branchCode: string,
  dayKey: string,
): string {
  return `PO-${branchCode}-${dayKey}`;
}

async function listExistingDocumentNos(prefix: string): Promise<string[]> {
  const like = `${prefix}-`;
  try {
    const existing = await prisma.branchPurchaseOrder.findMany({
      where: { documentNo: { startsWith: like } },
      select: { documentNo: true },
    });
    return existing.map((r) => r.documentNo);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Table / client not ready yet — still allow generating first number
    if (
      /BranchPurchaseOrder|does not exist|P2021|Unknown (arg|field|model)/i.test(
        msg,
      )
    ) {
      return [];
    }
    throw error;
  }
}

export async function generatePurchaseDocumentNo(input: {
  branchCode: string | null | undefined;
  branchId: string;
  documentDate?: string;
}): Promise<string> {
  const branchCode = normalizeBranchCode(
    input.branchCode,
    input.branchId,
  );
  const dayKey = input.documentDate
    ? input.documentDate.replace(/-/g, "")
    : bangkokDayKey();
  const prefix = purchaseDocumentNoPrefix(branchCode, dayKey);
  const like = `${prefix}-`;
  const existing = await listExistingDocumentNos(prefix);
  let maxRun = 0;
  for (const documentNo of existing) {
    const tail = documentNo.slice(like.length);
    if (!/^\d+$/.test(tail)) continue;
    maxRun = Math.max(maxRun, Number(tail));
  }
  return `${prefix}-${String(maxRun + 1).padStart(3, "0")}`;
}

/** Client / offline fallback while waiting for server number. */
export function provisionalPurchaseDocumentNo(
  branchCode: string | null | undefined,
  branchId: string,
  documentDate?: string,
): string {
  const code = normalizeBranchCode(branchCode, branchId || "branch");
  const dayKey = documentDate
    ? documentDate.replace(/-/g, "")
    : bangkokDayKey();
  const run = String(Date.now() % 1000).padStart(3, "0");
  return `${purchaseDocumentNoPrefix(code, dayKey)}-${run}`;
}

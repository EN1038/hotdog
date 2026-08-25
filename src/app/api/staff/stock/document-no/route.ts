import { z } from "zod";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  generateStockDocumentNo,
  type StockDocumentKind,
} from "@/lib/stock-document-no";

const querySchema = z.object({
  kind: z.enum(["IN", "OUT"]),
});

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const url = new URL(request.url);
    const q = querySchema.parse({ kind: url.searchParams.get("kind") ?? undefined });

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, code: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const documentNo = await generateStockDocumentNo({
      kind: q.kind as StockDocumentKind,
      branchCode: branch.code ?? "",
      branchId: branch.id,
    });

    return jsonOk({ documentNo, branchId: branch.id });
  } catch (error) {
    return handleApiError(error);
  }
}

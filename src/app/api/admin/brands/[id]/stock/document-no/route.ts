import { z } from "zod";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  generateStockDocumentNo,
  type StockDocumentKind,
} from "@/lib/stock-document-no";

type Params = { params: Promise<{ id: string }> };

const querySchema = z.object({
  kind: z.enum(["IN", "OUT"]),
  branchId: z.string().min(1).optional(),
});

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    await requireBrandAccess(brandId);
    const url = new URL(request.url);
    const q = querySchema.parse({
      kind: url.searchParams.get("kind") ?? undefined,
      branchId: url.searchParams.get("branchId") ?? undefined,
    });

    const branch = q.branchId
      ? await prisma.branch.findFirst({
          where: { id: q.branchId, brandId },
          select: { id: true, code: true },
        })
      : await prisma.branch.findFirst({
          where: { brandId, kind: "WAREHOUSE" },
          select: { id: true, code: true },
        });
    if (!branch) return jsonError("ไม่พบสาขาสำหรับออกเลขที่เอกสาร", 404);

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

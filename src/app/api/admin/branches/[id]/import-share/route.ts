import { z } from "zod";
import { assertBrandAccess, requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { importBranchCatalog } from "@/lib/branch-import";

type Params = { params: Promise<{ id: string }> };

const importSchema = z.object({
  code: z.string().trim().min(1),
  overwriteMenu: z.boolean().optional(),
  includeLocations: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: targetBranchId } = await params;
    const { session } = await requireBranchAccess(targetBranchId);
    const body = importSchema.parse(await request.json());
    const code = body.code.trim().toUpperCase();

    const target = await prisma.branch.findUnique({
      where: { id: targetBranchId },
    });
    if (!target) return jsonError("ไม่พบสาขาปลายทาง", 404);

    const share = await prisma.branchShareCode.findUnique({
      where: { code },
    });
    if (!share) return jsonError("ไม่พบโค้ดนี้", 404);

    if (share.sourceBranchId === targetBranchId) {
      return jsonError("ไม่สามารถนำเข้าจากสาขาเดียวกัน");
    }

    const source = await prisma.branch.findUnique({
      where: { id: share.sourceBranchId },
      select: { brandId: true },
    });
    if (!source) return jsonError("ไม่พบสาขาต้นทาง", 404);
    await assertBrandAccess(session, source.brandId);

    const result = await importBranchCatalog({
      sourceBranchId: share.sourceBranchId,
      targetBranchId,
      overwriteMenu: body.overwriteMenu ?? false,
      includeLocations: body.includeLocations ?? false,
    });

    return jsonOk({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

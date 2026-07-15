import { z } from "zod";
import { assertBrandAccess, requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { importBranchCatalog } from "@/lib/branch-import";

type Params = { params: Promise<{ id: string }> };

const copySchema = z.object({
  sourceBranchId: z.string().min(1),
  overwrite: z.boolean().optional(),
  includeLocations: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: targetBranchId } = await params;
    const { session } = await requireBranchAccess(targetBranchId);
    const body = copySchema.parse(await request.json());

    const [target, source] = await Promise.all([
      prisma.branch.findUnique({ where: { id: targetBranchId } }),
      prisma.branch.findUnique({ where: { id: body.sourceBranchId } }),
    ]);
    if (!target) return jsonError("ไม่พบสาขาปลายทาง", 404);
    if (!source) return jsonError("ไม่พบสาขาต้นทาง", 404);
    await assertBrandAccess(session, source.brandId);

    const result = await importBranchCatalog({
      sourceBranchId: body.sourceBranchId,
      targetBranchId,
      overwriteMenu: body.overwrite ?? false,
      includeLocations: body.includeLocations ?? false,
    });

    return jsonOk({ ok: true, copied: result.menuItems, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

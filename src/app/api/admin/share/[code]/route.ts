import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getBranchSharePreview } from "@/lib/branch-import";

type Params = { params: Promise<{ code: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { code: raw } = await params;
    const code = decodeURIComponent(raw).trim().toUpperCase();
    const row = await prisma.branchShareCode.findUnique({
      where: { code },
    });
    if (!row) return jsonError("ไม่พบโค้ดนี้", 404);

    const preview = await getBranchSharePreview(row.sourceBranchId);
    return jsonOk({
      code: row.code,
      ...preview,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

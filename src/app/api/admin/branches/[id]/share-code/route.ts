import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { generateShareCode } from "@/lib/branch-import";

type Params = { params: Promise<{ id: string }> };

/** Get or create a share code for this branch */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    let row = await prisma.branchShareCode.findFirst({
      where: { sourceBranchId: branchId },
      orderBy: { createdAt: "desc" },
    });

    if (!row) {
      for (let i = 0; i < 8; i += 1) {
        const code = generateShareCode();
        try {
          row = await prisma.branchShareCode.create({
            data: { code, sourceBranchId: branchId },
          });
          break;
        } catch {
          // unique collision — retry
        }
      }
    }

    if (!row) return jsonError("สร้างโค้ดไม่สำเร็จ กรุณาลองใหม่", 500);
    return jsonOk(row);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Regenerate share code */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    await prisma.branchShareCode.deleteMany({
      where: { sourceBranchId: branchId },
    });

    let row = null;
    for (let i = 0; i < 8; i += 1) {
      const code = generateShareCode();
      try {
        row = await prisma.branchShareCode.create({
          data: { code, sourceBranchId: branchId },
        });
        break;
      } catch {
        // retry
      }
    }
    if (!row) return jsonError("สร้างโค้ดไม่สำเร็จ กรุณาลองใหม่", 500);
    return jsonOk(row, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

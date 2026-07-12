import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const copySchema = z.object({
  sourceBranchId: z.string().min(1),
  itemIds: z.array(z.string()).optional(),
  overwrite: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: targetBranchId } = await params;
    const body = copySchema.parse(await request.json());

    if (body.sourceBranchId === targetBranchId) {
      return jsonError("ไม่สามารถคัดลอกจากสาขาเดียวกัน");
    }

    const [target, source] = await Promise.all([
      prisma.branch.findUnique({ where: { id: targetBranchId } }),
      prisma.branch.findUnique({ where: { id: body.sourceBranchId } }),
    ]);
    if (!target) return jsonError("ไม่พบสาขาปลายทาง", 404);
    if (!source) return jsonError("ไม่พบสาขาต้นทาง", 404);

    const sourceItems = await prisma.branchMenuItem.findMany({
      where: {
        branchId: body.sourceBranchId,
        ...(body.itemIds?.length ? { id: { in: body.itemIds } } : {}),
      },
      orderBy: [{ isHidden: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });

    if (sourceItems.length === 0) {
      return jsonOk({ ok: true, copied: 0 });
    }

    if (body.overwrite) {
      await prisma.branchMenuItem.deleteMany({ where: { branchId: targetBranchId } });
    }

    const created = await prisma.branchMenuItem.createMany({
      data: sourceItems.map((i) => ({
        branchId: targetBranchId,
        name: i.name,
        price: i.price,
        description: i.description,
        isHidden: i.isHidden,
        sortOrder: i.sortOrder,
      })),
    });

    return jsonOk({ ok: true, copied: created.count });
  } catch (error) {
    return handleApiError(error);
  }
}


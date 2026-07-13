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
      include: {
        optionGroups: {
          include: { options: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ isHidden: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });

    if (sourceItems.length === 0) {
      return jsonOk({ ok: true, copied: 0 });
    }

    if (body.overwrite) {
      await prisma.branchMenuItem.deleteMany({ where: { branchId: targetBranchId } });
    }

    let copied = 0;
    for (const item of sourceItems) {
      await prisma.branchMenuItem.create({
        data: {
          branchId: targetBranchId,
          name: item.name,
          price: item.price,
          description: item.description,
          category: item.category,
          imageUrl: item.imageUrl,
          isHidden: item.isHidden,
          isOutOfStock: item.isOutOfStock,
          sortOrder: item.sortOrder,
          optionGroups: {
            create: item.optionGroups.map((g) => ({
              name: g.name,
              required: g.required,
              maxSelect: g.maxSelect,
              sortOrder: g.sortOrder,
              options: {
                create: g.options.map((o) => ({
                  name: o.name,
                  priceDelta: o.priceDelta,
                  sortOrder: o.sortOrder,
                })),
              },
            })),
          },
        },
      });
      copied += 1;
    }

    return jsonOk({ ok: true, copied });
  } catch (error) {
    return handleApiError(error);
  }
}

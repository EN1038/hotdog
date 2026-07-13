import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string; itemId: string }> };

const createSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().optional(),
  maxSelect: z.number().int().min(1).optional(),
  sortOrder: z.number().int().optional(),
  options: z
    .array(
      z.object({
        name: z.string().min(1),
        priceDelta: z.number().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId } = await params;
    const item = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!item) return jsonError("ไม่พบเมนู", 404);

    const groups = await prisma.menuOptionGroup.findMany({
      where: { menuItemId: itemId },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    return jsonOk(groups);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId } = await params;
    const body = createSchema.parse(await request.json());

    const item = await prisma.branchMenuItem.findFirst({
      where: { id: itemId, branchId },
    });
    if (!item) return jsonError("ไม่พบเมนู", 404);

    const group = await prisma.menuOptionGroup.create({
      data: {
        menuItemId: itemId,
        name: body.name,
        required: body.required ?? false,
        maxSelect: body.maxSelect ?? 1,
        sortOrder: body.sortOrder ?? 0,
        options: body.options?.length
          ? {
              create: body.options.map((o, i) => ({
                name: o.name,
                priceDelta: o.priceDelta ?? 0,
                sortOrder: o.sortOrder ?? i + 1,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });
    return jsonOk(group, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

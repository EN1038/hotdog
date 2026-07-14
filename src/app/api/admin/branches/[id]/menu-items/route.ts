import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  description: z.string().optional().nullable(),
  categoryId: z.string().nullable().optional(),
  imageUrl: z.string().optional().nullable(),
  isHidden: z.boolean().optional(),
  isOutOfStock: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  optionGroupIds: z.array(z.string()).optional(),
});

const itemInclude = {
  category: { select: { id: true, name: true, sortOrder: true } },
  ...menuItemOptionGroupInclude,
} as const;

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const items = await prisma.branchMenuItem.findMany({
      where: { branchId },
      include: itemInclude,
      orderBy: [{ isHidden: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return jsonOk(items.map(flattenMenuItemOptionGroups));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const body = createSchema.parse(await request.json());
    const categoryId = body.categoryId || null;
    const optionGroupIds = body.optionGroupIds ?? [];

    if (categoryId) {
      const cat = await prisma.menuCategory.findFirst({
        where: { id: categoryId, branchId },
      });
      if (!cat) return jsonError("ไม่พบหมวดหมู่", 404);
    }

    if (optionGroupIds.length > 0) {
      const groups = await prisma.branchOptionGroup.findMany({
        where: { id: { in: optionGroupIds }, branchId },
        select: { id: true },
      });
      if (groups.length !== optionGroupIds.length) {
        return jsonError("มีหัวข้อตัวเลือกที่ไม่ใช่ของสาขานี้");
      }
    }

    const item = await prisma.branchMenuItem.create({
      data: {
        branchId,
        name: body.name,
        price: body.price,
        description: body.description ?? null,
        categoryId,
        imageUrl: body.imageUrl ?? null,
        isHidden: body.isHidden ?? false,
        isOutOfStock: body.isOutOfStock ?? false,
        sortOrder: body.sortOrder ?? 0,
        ...(optionGroupIds.length
          ? {
              optionGroupLinks: {
                create: optionGroupIds.map((groupId) => ({ groupId })),
              },
            }
          : {}),
      },
      include: itemInclude,
    });
    return jsonOk(flattenMenuItemOptionGroups(item), 201);
  } catch (error) {
    return handleApiError(error);
  }
}

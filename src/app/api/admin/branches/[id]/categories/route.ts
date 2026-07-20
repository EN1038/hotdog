import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1),
  sortOrder: z.number().int().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const categories = await prisma.menuCategory.findMany({
      where: { branchId },
      include: { _count: { select: { menuItems: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return jsonOk(categories);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const body = createSchema.parse(await request.json());
    const existing = await prisma.menuCategory.findUnique({
      where: {
        branchId_name: { branchId, name: body.name },
      },
    });
    if (existing) return jsonError("ชื่อหมวดหมู่ซ้ำในสาขานี้");

    const maxSort = await prisma.menuCategory.aggregate({
      where: { branchId },
      _max: { sortOrder: true },
    });

    const category = await prisma.menuCategory.create({
      data: {
        branchId,
        name: body.name,
        sortOrder: body.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1,
      },
      include: { _count: { select: { menuItems: true } } },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "category.create",
      summary: `เพิ่มหมวดหมู่ ${category.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "category",
      entityId: category.id,
      entityName: category.name,
    });

    return jsonOk(category, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = reorderSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const categories = await prisma.menuCategory.findMany({
      where: { branchId },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    if (categories.length !== body.orderedIds.length) {
      return jsonError("จำนวนหมวดหมู่ไม่ตรงกับข้อมูลล่าสุด", 400);
    }

    const categoryIds = new Set(categories.map((category) => category.id));
    const orderedIds = new Set(body.orderedIds);

    if (
      orderedIds.size !== body.orderedIds.length ||
      body.orderedIds.some((id) => !categoryIds.has(id))
    ) {
      return jsonError("ข้อมูลลำดับหมวดหมู่ไม่ถูกต้อง", 400);
    }

    await prisma.$transaction(
      body.orderedIds.map((categoryId, index) =>
        prisma.menuCategory.update({
          where: { id: categoryId },
          data: { sortOrder: index },
        }),
      ),
    );

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "category.reorder",
      summary: `จัดลำดับหมวดหมู่ ${categories.length} รายการ`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "branch",
      entityId: branchId,
      entityName: ctx?.name ?? branch.name,
    });

    const orderedCategories = await prisma.menuCategory.findMany({
      where: { branchId },
      include: { _count: { select: { menuItems: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return jsonOk(orderedCategories);
  } catch (error) {
    return handleApiError(error);
  }
}

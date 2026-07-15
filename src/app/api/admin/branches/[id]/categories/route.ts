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

    const category = await prisma.menuCategory.create({
      data: {
        branchId,
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
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

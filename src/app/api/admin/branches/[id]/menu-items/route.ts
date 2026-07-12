import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  description: z.string().optional().nullable(),
  isHidden: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const items = await prisma.branchMenuItem.findMany({
      where: { branchId },
      orderBy: [{ isHidden: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return jsonOk(items);
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
    const item = await prisma.branchMenuItem.create({
      data: {
        branchId,
        name: body.name,
        price: body.price,
        description: body.description ?? null,
        isHidden: body.isHidden ?? false,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return jsonOk(item, 201);
  } catch (error) {
    return handleApiError(error);
  }
}


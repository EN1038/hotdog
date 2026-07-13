import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = {
  params: Promise<{ id: string; itemId: string; groupId: string }>;
};

const createSchema = z.object({
  name: z.string().min(1),
  priceDelta: z.number().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, itemId, groupId } = await params;
    const body = createSchema.parse(await request.json());

    const group = await prisma.menuOptionGroup.findFirst({
      where: { id: groupId, menuItem: { id: itemId, branchId } },
    });
    if (!group) return jsonError("ไม่พบกลุ่มตัวเลือก", 404);

    const option = await prisma.menuOption.create({
      data: {
        groupId,
        name: body.name,
        priceDelta: body.priceDelta ?? 0,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return jsonOk(option, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

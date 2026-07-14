import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string; groupId: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1),
  priceDelta: z.number().optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, groupId } = await params;
    const group = await prisma.branchOptionGroup.findFirst({
      where: { id: groupId, branchId },
    });
    if (!group) return jsonError("ไม่พบหัวข้อตัวเลือก", 404);

    const body = createSchema.parse(await request.json());
    const option = await prisma.branchOption.create({
      data: {
        groupId,
        name: body.name,
        priceDelta: body.priceDelta ?? 0,
      },
    });
    return jsonOk(option, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

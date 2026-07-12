import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        staff: { include: { roles: true }, orderBy: { createdAt: "desc" } },
        menuItems: { orderBy: [{ isHidden: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }] },
        deliveryLocations: { orderBy: { name: "asc" } },
        orders: {
          include: {
            customer: true,
            deliveryLocation: true,
            items: { include: { branchMenuItem: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    return jsonOk(branch);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
      },
    });
    return jsonOk(branch);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.branch.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StaffRole } from "@prisma/client";

type Params = { params: Promise<{ id: string; staffId: string }> };

const patchSchema = z.object({
  phone: z.string().min(9).optional(),
  isActive: z.boolean().optional(),
  roles: z.array(z.nativeEnum(StaffRole)).min(1).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, staffId } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.staff.findFirst({
      where: { id: staffId, branchId },
      include: { roles: true },
    });
    if (!existing) return jsonError("ไม่พบพนักงาน", 404);

    const updated = await prisma.staff.update({
      where: { id: staffId },
      data: {
        ...(body.phone !== undefined && { phone: normalizePhone(body.phone) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.roles !== undefined && {
          roles: {
            deleteMany: {},
            create: body.roles.map((role) => ({ role })),
          },
        }),
      },
      include: { roles: true },
    });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId, staffId } = await params;
    const existing = await prisma.staff.findFirst({
      where: { id: staffId, branchId },
    });
    if (!existing) return jsonError("ไม่พบพนักงาน", 404);

    await prisma.staff.delete({ where: { id: staffId } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}


import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StaffRole } from "@prisma/client";

type Params = { params: Promise<{ id: string; staffId: string }> };

const genderSchema = z.enum(["male", "female", "other"]).nullable().optional();

const patchSchema = z.object({
  phone: z.string().min(9).optional(),
  name: z.string().trim().nullable().optional(),
  gender: genderSchema,
  age: z.number().int().min(1).max(120).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
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

    let nextPhone: string | undefined;
    if (body.phone !== undefined) {
      nextPhone = normalizePhone(body.phone);
      if (nextPhone.length < 9) {
        return jsonError("เบอร์โทรไม่ถูกต้อง");
      }
      if (nextPhone !== existing.phone) {
        const duplicate = await prisma.staff.findUnique({
          where: { phone: nextPhone },
        });
        if (duplicate) {
          return jsonError("เบอร์โทรนี้ถูกใช้ในระบบแล้ว", 409);
        }
      }
    }

    const updated = await prisma.staff.update({
      where: { id: staffId },
      data: {
        ...(nextPhone !== undefined && { phone: nextPhone }),

        ...(body.name !== undefined && {
          name: body.name?.trim() ? body.name.trim() : null,
        }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.age !== undefined && { age: body.age }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
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

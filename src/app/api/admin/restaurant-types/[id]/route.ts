import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  showInOwnerRegister: z.boolean().optional(),
  ownerRegisterHint: z.string().trim().max(200).nullable().optional(),
  ownerRegisterPlan: z
    .enum(["RETAIL", "WEIGH_TABLE", "MALA", "MULTI"])
    .optional(),
  ownerRegisterOperatingMode: z
    .enum(["NORMAL", "SKEWER", "BBQ_WEIGH"])
    .optional(),
  offersMasterImport: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.restaurantType.findUnique({ where: { id } });
    if (!existing) return jsonError("ไม่พบประเภทร้าน", 404);

    if (body.code && body.code !== existing.code) {
      const dup = await prisma.restaurantType.findUnique({
        where: { code: body.code },
      });
      if (dup) return jsonError("รหัสประเภทซ้ำ");
    }

    const type = await prisma.restaurantType.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.showInOwnerRegister !== undefined && {
          showInOwnerRegister: body.showInOwnerRegister,
        }),
        ...(body.ownerRegisterHint !== undefined && {
          ownerRegisterHint: body.ownerRegisterHint?.trim() || null,
        }),
        ...(body.ownerRegisterPlan !== undefined && {
          ownerRegisterPlan: body.ownerRegisterPlan,
        }),
        ...(body.ownerRegisterOperatingMode !== undefined && {
          ownerRegisterOperatingMode: body.ownerRegisterOperatingMode,
        }),
        ...(body.offersMasterImport !== undefined && {
          offersMasterImport: body.offersMasterImport,
        }),
      },
    });

    await logAdminActivity(session, {
      action: "restaurant_type.update",
      summary: `แก้ไขประเภทร้าน ${type.name}`,
      entityType: "restaurant_type",
      entityId: type.id,
      entityName: type.name,
    });

    return jsonOk(type);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id } = await params;
    const existing = await prisma.restaurantType.findUnique({ where: { id } });
    if (!existing) return jsonError("ไม่พบประเภทร้าน", 404);

    const usedAsPrimary = await prisma.branch.count({
      where: { primaryCategory: existing.code },
    });
    const usedAsSecondary = await prisma.branch.count({
      where: { secondaryCategories: { has: existing.code } },
    });
    if (usedAsPrimary + usedAsSecondary > 0) {
      return jsonError(
        `ลบไม่ได้ — มีสาขาใช้ประเภทนี้อยู่ ${usedAsPrimary + usedAsSecondary} สาขา (ปิดใช้งานแทนได้)`,
      );
    }

    await prisma.restaurantType.delete({ where: { id } });

    await logAdminActivity(session, {
      action: "restaurant_type.delete",
      summary: `ลบประเภทร้าน ${existing.name}`,
      entityType: "restaurant_type",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

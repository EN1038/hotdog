import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  fileUrl: z.string().trim().min(1).max(2000).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.alertSound.findUnique({ where: { id } });
    if (!existing) return jsonError("ไม่พบเสียงนี้", 404);

    const sound = await prisma.alertSound.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.fileUrl !== undefined && { fileUrl: body.fileUrl }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await logAdminActivity(session, {
      action: "alert_sound.update",
      summary: `แก้ไขเสียงแจ้งเตือน ${sound.name}`,
      entityType: "alert_sound",
      entityId: sound.id,
      entityName: sound.name,
    });

    return jsonOk(sound);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id } = await params;

    const existing = await prisma.alertSound.findUnique({ where: { id } });
    if (!existing) return jsonError("ไม่พบเสียงนี้", 404);

    await prisma.branch.updateMany({
      where: { alertSoundId: id },
      data: { alertSoundId: null },
    });
    await prisma.alertSound.delete({ where: { id } });

    await logAdminActivity(session, {
      action: "alert_sound.delete",
      summary: `ลบเสียงแจ้งเตือน ${existing.name}`,
      entityType: "alert_sound",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const patchSchema = z.object({
  alertSoundId: z.string().trim().min(1).nullable(),
});

export async function GET() {
  try {
    const session = await requireStaff();

    const [sounds, branch] = await Promise.all([
      prisma.alertSound.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, fileUrl: true },
      }),
      prisma.branch.findUnique({
        where: { id: session.branchId },
        select: {
          alertSoundId: true,
          alertSound: {
            select: { id: true, name: true, fileUrl: true, isActive: true },
          },
        },
      }),
    ]);

    const selected =
      branch?.alertSound && branch.alertSound.isActive
        ? {
            id: branch.alertSound.id,
            name: branch.alertSound.name,
            fileUrl: branch.alertSound.fileUrl,
          }
        : null;

    return jsonOk({
      alertSounds: sounds,
      alertSound: selected,
      alertSoundId: selected?.id ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireStaff();
    const body = patchSchema.parse(await request.json());

    if (body.alertSoundId) {
      const sound = await prisma.alertSound.findFirst({
        where: { id: body.alertSoundId, isActive: true },
        select: { id: true, name: true, fileUrl: true },
      });
      if (!sound) return jsonError("ไม่พบเสียงนี้หรือถูกปิดใช้งาน");

      await prisma.branch.update({
        where: { id: session.branchId },
        data: { alertSoundId: sound.id },
      });

      return jsonOk({
        alertSoundId: sound.id,
        alertSound: sound,
      });
    }

    await prisma.branch.update({
      where: { id: session.branchId },
      data: { alertSoundId: null },
    });

    return jsonOk({ alertSoundId: null, alertSound: null });
  } catch (error) {
    return handleApiError(error);
  }
}

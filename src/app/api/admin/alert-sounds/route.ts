import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { saveUploadedAudio } from "@/lib/uploads";

export const runtime = "nodejs";

const createJsonSchema = z.object({
  name: z.string().trim().min(1).max(80),
  fileUrl: z.string().trim().min(1).max(2000),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "1";

    const sounds = await prisma.alertSound.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return jsonOk(sounds);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const contentType = request.headers.get("content-type") || "";

    let name: string;
    let fileUrl: string;
    let sortOrder: number | undefined;
    let isActive = true;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const nameRaw = form.get("name");
      if (!(file instanceof File) || file.size === 0) {
        return jsonError("ไม่พบไฟล์เสียง");
      }
      name =
        typeof nameRaw === "string" && nameRaw.trim()
          ? nameRaw.trim()
          : file.name.replace(/\.mp3$/i, "") || "เสียงใหม่";
      fileUrl = await saveUploadedAudio(file, { folder: "Alerts" });
      const sortRaw = form.get("sortOrder");
      if (typeof sortRaw === "string" && sortRaw.trim()) {
        const n = Number(sortRaw);
        if (Number.isFinite(n)) sortOrder = Math.trunc(n);
      }
    } else {
      const body = createJsonSchema.parse(await request.json());
      name = body.name;
      fileUrl = body.fileUrl;
      sortOrder = body.sortOrder;
      isActive = body.isActive ?? true;
    }

    const maxSort = await prisma.alertSound.aggregate({
      _max: { sortOrder: true },
    });

    const sound = await prisma.alertSound.create({
      data: {
        name,
        fileUrl,
        sortOrder: sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        isActive,
      },
    });

    await logAdminActivity(session, {
      action: "alert_sound.create",
      summary: `เพิ่มเสียงแจ้งเตือน ${sound.name}`,
      entityType: "alert_sound",
      entityId: sound.id,
      entityName: sound.name,
      metadata: { fileUrl: sound.fileUrl },
    });

    return jsonOk(sound, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

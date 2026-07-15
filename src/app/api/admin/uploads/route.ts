import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { saveUploadedImage } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return jsonError("ไม่พบไฟล์รูปภาพ");
    }

    const shopCodeRaw = form.get("shopCode");
    const folderRaw = form.get("folder");
    const shopCode =
      typeof shopCodeRaw === "string" ? shopCodeRaw : undefined;
    const folder = typeof folderRaw === "string" ? folderRaw : undefined;

    const url = await saveUploadedImage(file, { shopCode, folder });
    return jsonOk({ url }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { saveUploadedImage } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return jsonError("ไม่พบไฟล์รูปภาพ");
    }

    const url = await saveUploadedImage(file, {
      shopCode: session.branchId,
      folder: "order-photos",
    });
    return jsonOk({ url }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

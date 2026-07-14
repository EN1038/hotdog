import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";

/** @deprecated Use /api/admin/branches/[id]/categories */
export async function GET() {
  try {
    await requireAdmin();
    return jsonError(
      "หมวดหมู่เป็นของสาขาแล้ว — ใช้ /api/admin/branches/{id}/categories",
      410,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  return GET();
}

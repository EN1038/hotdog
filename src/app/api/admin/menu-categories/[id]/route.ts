import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** @deprecated Use /api/admin/branches/[id]/categories/[categoryId] */
export async function GET(_request: Request, _ctx: Params) {
  try {
    await requireAdmin();
    return jsonError(
      "หมวดหมู่เป็นของสาขาแล้ว — ใช้ API ในสาขา",
      410,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, ctx: Params) {
  return GET(request, ctx);
}

export async function DELETE(request: Request, ctx: Params) {
  return GET(request, ctx);
}

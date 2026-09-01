import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { loadPublicStockLabel } from "@/lib/stock-label-public";

/** GET — public package label info (QR scan target) */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const label = await loadPublicStockLabel(id.trim());
    if (!label) return jsonError("ไม่พบป้ายแพ็ก", 404);
    return jsonOk(label);
  } catch (error) {
    return handleApiError(error);
  }
}

import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { loadPublicSkewerOrderReceipt } from "@/lib/skewer-order-public-share";

type Params = { params: Promise<{ token: string }> };

/** Public (no auth) skewer order receipt — single order only. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const receipt = await loadPublicSkewerOrderReceipt(
      decodeURIComponent(token),
    );
    if (!receipt) return jsonError("ไม่พบใบออเดอร์เสียบไม้นี้", 404);
    return jsonOk(receipt);
  } catch (error) {
    return handleApiError(error);
  }
}

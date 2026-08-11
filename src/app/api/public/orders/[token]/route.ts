import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import { loadPublicOrderReceipt } from "@/lib/order-public-share";

type Params = { params: Promise<{ token: string }> };

/** Public (no auth) order receipt for customer verification. */
export async function GET(_request: Request, { params }: Params) {
  try {
    await ensureProdSchemaCompat();
    const { token } = await params;
    const receipt = await loadPublicOrderReceipt(decodeURIComponent(token));
    if (!receipt) return jsonError("ไม่พบใบรับรองออเดอร์นี้", 404);
    return jsonOk(receipt);
  } catch (error) {
    return handleApiError(error);
  }
}

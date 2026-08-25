import { requireBrandAccess } from "@/lib/admin-access";
import { handleApiError, jsonOk } from "@/lib/api";
import { listWarehouseMovements } from "@/lib/warehouse-history";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    await requireBrandAccess(brandId);
    const url = new URL(request.url);
    const movements = await listWarehouseMovements({
      brandId,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      q: url.searchParams.get("q"),
    });
    return jsonOk({ movements });
  } catch (error) {
    return handleApiError(error);
  }
}

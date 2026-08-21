import { requireWarehouseStaff } from "@/lib/warehouse-branch";
import { handleApiError, jsonOk } from "@/lib/api";
import { listWarehouseMovements } from "@/lib/warehouse-history";

export async function GET(request: Request) {
  try {
    const { brandId } = await requireWarehouseStaff();
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

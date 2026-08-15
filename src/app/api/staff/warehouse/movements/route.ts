import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StockError } from "@/lib/stock";
import {
  applyBrandStockMovement,
  stockMovementSchema,
} from "@/lib/stock-movement-actions";
import { requireWarehouseStaff } from "@/lib/warehouse-branch";

export async function POST(request: Request) {
  try {
    const { session, brandId } = await requireWarehouseStaff();
    const body = stockMovementSchema.parse(await request.json());
    const { movement } = await applyBrandStockMovement({
      brandId,
      body,
      actor: { staffId: session.staffId },
    });
    return jsonOk(movement ?? { ok: true }, 201);
  } catch (error) {
    if (error instanceof StockError) {
      return jsonError(error.message, error.status);
    }
    return handleApiError(error);
  }
}

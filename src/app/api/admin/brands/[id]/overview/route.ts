import { requireBrandAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { buildHqOverview } from "@/lib/admin-hq-overview";
import { buildWarehouseStockFlow } from "@/lib/warehouse-stock-flow";

type Params = { params: Promise<{ id: string }> };

function normalizeRange(fromRaw: string, toRaw: string) {
  return fromRaw <= toRaw
    ? { from: fromRaw, to: toRaw }
    : { from: toRaw, to: fromRaw };
}

/** GET — brand HQ overview: sales, expenses, current sale stock. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    if (
      !fromParam ||
      !toParam ||
      !isBangkokDateKey(fromParam) ||
      !isBangkokDateKey(toParam)
    ) {
      return jsonError("ต้องระบุ from/to เป็น YYYY-MM-DD");
    }

    const { from, to } = normalizeRange(fromParam, toParam);
    const includeTest = searchParams.get("includeTest") === "1";
    const branchId = searchParams.get("branchId")?.trim() || null;
    const [data, warehouseFlow] = await Promise.all([
      buildHqOverview(session, from, to, {
        brandId,
        includeTest,
        branchId,
      }),
      buildWarehouseStockFlow({
        brandId,
        from,
        to,
        branchId,
        includeTest,
      }),
    ]);
    return jsonOk({
      brandId,
      brandName: data.branches[0]?.brandName ?? null,
      ...data,
      warehouseFlow,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

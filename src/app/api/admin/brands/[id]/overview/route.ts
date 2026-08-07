import { requireBrandAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { buildHqOverview } from "@/lib/admin-hq-overview";

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
    const data = await buildHqOverview(session, from, to, { brandId });
    return jsonOk({
      brandId,
      brandName: data.branches[0]?.brandName ?? null,
      ...data,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

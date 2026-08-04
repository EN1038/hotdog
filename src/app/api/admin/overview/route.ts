import { requireAdmin } from "@/lib/auth";
import { assertBrandAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { buildHqOverview } from "@/lib/admin-hq-overview";

function normalizeRange(fromRaw: string, toRaw: string) {
  return fromRaw <= toRaw
    ? { from: fromRaw, to: toRaw }
    : { from: toRaw, to: fromRaw };
}

/** GET — HQ overview across every accessible branch. */
export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const brandId = searchParams.get("brandId")?.trim() || undefined;

    if (
      !fromParam ||
      !toParam ||
      !isBangkokDateKey(fromParam) ||
      !isBangkokDateKey(toParam)
    ) {
      return jsonError("ต้องระบุ from/to เป็น YYYY-MM-DD");
    }

    if (brandId) {
      await assertBrandAccess(session, brandId);
    }

    const { from, to } = normalizeRange(fromParam, toParam);
    const data = await buildHqOverview(session, from, to, { brandId });
    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}

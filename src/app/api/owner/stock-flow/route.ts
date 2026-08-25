import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  bangkokDateKey,
  isBangkokDateKey,
} from "@/lib/constants";
import { isTestBranch } from "@/lib/branch-test";
import { getCalendarDayState } from "@/lib/operating-day";
import { buildHqOverview } from "@/lib/admin-hq-overview";
import { buildWarehouseStockFlow } from "@/lib/warehouse-stock-flow";

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    if (session.isPlatformAdmin) {
      return jsonError("หน้านี้สำหรับเจ้าของร้าน", 403, { redirect: "/admin" });
    }

    const accessible = getAccessibleBrandIds(session);
    const brandIds = accessible ?? [];
    if (brandIds.length === 0) {
      return jsonError("บัญชีนี้ยังไม่ได้ผูกกับร้าน", 403);
    }

    const { searchParams } = new URL(request.url);
    const brandIdParam = searchParams.get("brandId")?.trim();
    const brandId =
      brandIdParam && brandIds.includes(brandIdParam)
        ? brandIdParam
        : brandIds[0]!;

    const dayState = getCalendarDayState();
    const today = dayState.operatingDay || bangkokDateKey();
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    let rangeFrom =
      fromParam && isBangkokDateKey(fromParam) ? fromParam : today;
    let rangeTo = toParam && isBangkokDateKey(toParam) ? toParam : today;
    if (rangeFrom > rangeTo) {
      const tmp = rangeFrom;
      rangeFrom = rangeTo;
      rangeTo = tmp;
    }
    if (rangeTo > today) rangeTo = today;
    if (rangeFrom > today) rangeFrom = today;

    const includeTest = searchParams.get("includeTest") === "1";
    const branchIdParam = searchParams.get("branchId")?.trim() || null;

    const branches = await prisma.branch.findMany({
      where: { brandId },
      select: {
        id: true,
        name: true,
        code: true,
        isOpen: true,
        isTest: true,
        isHidden: true,
        kind: true,
      },
      orderBy: { name: "asc" },
    });

    const [data, warehouseFlow] = await Promise.all([
      buildHqOverview(session, rangeFrom, rangeTo, {
        brandId,
        includeTest,
        branchId: branchIdParam,
      }),
      buildWarehouseStockFlow({
        brandId,
        from: rangeFrom,
        to: rangeTo,
        branchId: branchIdParam,
        includeTest,
      }),
    ]);

    const filterBranches = (includeTest
      ? branches
      : branches.filter((b) => !b.isTest)
    ).filter((b) => b.kind !== "WAREHOUSE" && !b.isHidden);

    return jsonOk({
      brandId,
      ...data,
      warehouseFlow,
      branchesMeta: filterBranches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        isOpen: b.isOpen,
        isHidden: b.isHidden,
        kind: b.kind,
        isTest: isTestBranch(b),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

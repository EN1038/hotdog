import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  bangkokDateKey,
  isBangkokDateKey,
  queueBusinessDateFromKey,
} from "@/lib/constants";
import { isTestBranch } from "@/lib/branch-test";
import {
  serializeExpense,
  summarizeExpenses,
} from "@/lib/branch-expense";
import { getCalendarDayState } from "@/lib/operating-day";

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

    const hasTestBranch = branches.some((b) => b.isTest);
    const scopedBranches = (includeTest
      ? branches
      : branches.filter((b) => !b.isTest)
    ).filter((b) => b.kind !== "WAREHOUSE" && !b.isHidden);
    const selected =
      branchIdParam != null
        ? scopedBranches.find((b) => b.id === branchIdParam) ?? null
        : null;
    const reportBranches = selected ? [selected] : scopedBranches;
    const branchIds = reportBranches.map((b) => b.id);
    const branchNames = new Map(reportBranches.map((b) => [b.id, b.name]));

    const rows =
      branchIds.length === 0
        ? []
        : await prisma.branchExpense.findMany({
            where: {
              branchId: { in: branchIds },
              expenseDate: {
                gte: queueBusinessDateFromKey(rangeFrom),
                lte: queueBusinessDateFromKey(rangeTo),
              },
            },
            orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
            include: {
              createdByStaff: { select: { name: true } },
              createdByAdmin: { select: { username: true } },
            },
            take: 500,
          });

    const expenses = rows.map((row) => ({
      ...serializeExpense(row),
      branchName: branchNames.get(row.branchId) ?? "สาขา",
    }));

    return jsonOk({
      from: rangeFrom,
      to: rangeTo,
      filterBranchId: selected?.id ?? null,
      hasTestBranch,
      includeTest,
      branches: scopedBranches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        isOpen: b.isOpen,
        isHidden: b.isHidden,
        kind: b.kind,
        isTest: isTestBranch(b),
      })),
      expenses,
      summary: summarizeExpenses(expenses),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

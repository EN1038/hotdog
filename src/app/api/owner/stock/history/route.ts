import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { isTestBranch } from "@/lib/branch-test";
import {
  isBranchHistoryKind,
  type BranchHistoryKind,
} from "@/lib/branch-stock-history";
import { loadBranchStockHistoryBatches } from "@/lib/branch-stock-history-query";

/** GET — ประวัติสต๊อกเจ้าของร้าน (หลายสาขา) */
export async function GET(request: Request) {
  try {
    const { ensureProdSchemaCompat } = await import("@/lib/schema-compat");
    void ensureProdSchemaCompat();

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

    const fromStr = searchParams.get("from")?.trim() ?? "";
    const toStr = searchParams.get("to")?.trim() ?? "";
    const kindRaw = searchParams.get("kind")?.trim() || "all";
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const includeTest = searchParams.get("includeTest") === "1";
    const branchIdParam = searchParams.get("branchId")?.trim() || null;

    if (!isBangkokDateKey(fromStr) || !isBangkokDateKey(toStr)) {
      return jsonError("กรุณาระบุช่วงวันที่ (from/to เป็น YYYY-MM-DD)");
    }
    const kind: BranchHistoryKind = isBranchHistoryKind(kindRaw)
      ? kindRaw
      : "all";

    const limitRaw = Number(searchParams.get("limit") ?? "40");
    const offsetRaw = Number(searchParams.get("offset") ?? "0");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(80, Math.max(10, Math.floor(limitRaw)))
      : 40;
    const offset = Number.isFinite(offsetRaw)
      ? Math.max(0, Math.floor(offsetRaw))
      : 0;

    const branches = await prisma.branch.findMany({
      where: { brandId },
      select: {
        id: true,
        name: true,
        isTest: true,
        isHidden: true,
        kind: true,
      },
      orderBy: { name: "asc" },
    });

    const liveBranches = branches.filter(
      (b) =>
        b.kind !== "WAREHOUSE" &&
        !b.isHidden &&
        (includeTest || !isTestBranch(b)),
    );

    if (branchIdParam && !liveBranches.some((b) => b.id === branchIdParam)) {
      return jsonError("ไม่มีสิทธิ์เข้าถึงสาขานี้", 403);
    }

    const selected = branchIdParam
      ? liveBranches.filter((b) => b.id === branchIdParam)
      : liveBranches;

    const branchNames: Record<string, string> = {};
    for (const b of selected) {
      branchNames[b.id] = b.name;
    }

    const result = await loadBranchStockHistoryBatches({
      branchIds: selected.map((b) => b.id),
      branchNames,
      from: fromStr,
      to: toStr,
      kind,
      q,
      limit,
      offset,
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

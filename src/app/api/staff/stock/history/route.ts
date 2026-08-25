import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isBangkokDateKey } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isBranchHistoryKind,
  type BranchHistoryKind,
} from "@/lib/branch-stock-history";
import { loadBranchStockHistoryBatches } from "@/lib/branch-stock-history-query";

/** GET — ประวัติสต๊อกสาขา จัดกลุ่มตามเลขเอกสาร / ออเดอร์ขาย */
export async function GET(request: Request) {
  try {
    const { ensureProdSchemaCompat } = await import("@/lib/schema-compat");
    void ensureProdSchemaCompat();

    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from")?.trim() ?? "";
    const toStr = searchParams.get("to")?.trim() ?? "";
    const kindRaw = searchParams.get("kind")?.trim() || "all";
    const q = searchParams.get("q")?.trim().toLowerCase() || "";

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

    let branchName: string | undefined;
    try {
      const branch = await prisma.branch.findUnique({
        where: { id: session.branchId },
        select: { name: true },
      });
      branchName = branch?.name;
    } catch {
      /* optional */
    }

    const result = await loadBranchStockHistoryBatches({
      branchIds: [session.branchId],
      branchNames: branchName
        ? { [session.branchId]: branchName }
        : undefined,
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

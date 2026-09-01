import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  assertPackageHistoryDates,
  isPackageHistoryKind,
  loadPackageBatchById,
  loadPackageHistoryBatches,
  type PackageHistoryKind,
} from "@/lib/stock-package-history";
import { labelsToPrintInput } from "@/lib/stock-package-label-print";
import { stockLabelQrPayload } from "@/lib/stock-label";
import { prisma } from "@/lib/db";

/** GET — package-in history (grouped by batch) or reprint labels */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId")?.trim();

    if (batchId) {
      const batch = await loadPackageBatchById({
        branchId: session.branchId,
        batchId,
      });
      if (!batch) return jsonError("ไม่พบรายการ", 404);

      const labelIds = batch.lines.map((l) => l.id);
      const rows = await prisma.stockLabel.findMany({
        where: { id: { in: labelIds } },
      });
      const labels = labelsToPrintInput(rows).map((l, i) => ({
        ...l,
        qrPayload: stockLabelQrPayload({
          id: rows[i].id,
          labelCode: rows[i].labelCode,
        }),
      }));

      return jsonOk({ batch, labels });
    }

    const fromStr = searchParams.get("from")?.trim() ?? "";
    const toStr = searchParams.get("to")?.trim() ?? "";
    try {
      assertPackageHistoryDates(fromStr, toStr);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "วันที่ไม่ถูกต้อง");
    }

    const kindRaw = searchParams.get("kind")?.trim() || "all";
    const kind: PackageHistoryKind = isPackageHistoryKind(kindRaw)
      ? kindRaw
      : "all";
    const q = searchParams.get("q")?.trim() ?? "";
    const limitRaw = Number(searchParams.get("limit") ?? "40");
    const offsetRaw = Number(searchParams.get("offset") ?? "0");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(80, Math.max(10, Math.floor(limitRaw)))
      : 40;
    const offset = Number.isFinite(offsetRaw)
      ? Math.max(0, Math.floor(offsetRaw))
      : 0;

    const result = await loadPackageHistoryBatches({
      branchId: session.branchId,
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

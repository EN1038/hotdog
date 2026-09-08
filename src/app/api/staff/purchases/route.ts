import { requireStaff } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bangkokDateKey, isBangkokDateKey } from "@/lib/constants";
import { purchaseCreateSchema, purchaseDateFromKey } from "@/lib/branch-purchase";
import {
  createPurchaseOrder,
  serializePurchaseOrder,
} from "@/lib/branch-purchase-service";

function isMissingPurchaseTable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /BranchPurchaseOrder|does not exist|relation .* does not exist|P2021/i.test(
    msg,
  );
}

/** GET — list branch purchases for a date range (default today). */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || null;
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const dateParam = searchParams.get("date");
    const limitRaw = Number(searchParams.get("limit") || "40");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
      : 40;

    const today = bangkokDateKey();
    let fromKey = today;
    let toKey = today;
    if (
      fromParam &&
      isBangkokDateKey(fromParam) &&
      toParam &&
      isBangkokDateKey(toParam)
    ) {
      fromKey = fromParam <= toParam ? fromParam : toParam;
      toKey = fromParam <= toParam ? toParam : fromParam;
    } else if (dateParam && isBangkokDateKey(dateParam)) {
      fromKey = dateParam;
      toKey = dateParam;
    }

    const dateFilter = {
      gte: purchaseDateFromKey(fromKey),
      lte: purchaseDateFromKey(toKey),
    };

    try {
      const rows = await prisma.branchPurchaseOrder.findMany({
        where: {
          branchId: session.branchId,
          documentDate: dateFilter,
          ...(status ? { status } : {}),
        },
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
            include: { item: { select: { imageUrl: true } } },
          },
        },
        orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return jsonOk({
        from: fromKey,
        to: toKey,
        items: rows.map(serializePurchaseOrder),
      });
    } catch (error) {
      if (isMissingPurchaseTable(error)) {
        return jsonOk({ from: fromKey, to: toKey, items: [] });
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    const body = purchaseCreateSchema.parse(await request.json());
    try {
      const item = await createPurchaseOrder({
        branchId: session.branchId,
        staffId: session.staffId,
        data: body,
      });
      return jsonOk({ item }, 201);
    } catch (err) {
      if (isMissingPurchaseTable(err)) {
        return jsonError(
          "ระบบจัดซื้อยังไม่พร้อม — ติดต่อแอดมินให้ติดตั้งตารางฐานข้อมูล",
          503,
        );
      }
      const msg = err instanceof Error ? err.message : "บันทึกไม่สำเร็จ";
      return jsonError(msg, 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

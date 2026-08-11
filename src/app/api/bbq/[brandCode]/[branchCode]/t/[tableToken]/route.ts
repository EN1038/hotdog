import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { BranchOperatingMode } from "@prisma/client";
import { sessionGrandTotal } from "@/lib/table-session-totals";

type Params = {
  params: Promise<{ brandCode: string; branchCode: string; tableToken: string }>;
};

/** Public: resolve table QR → branch + open/create session info */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { brandCode, branchCode, tableToken } = await params;

    const table = await prisma.diningTable.findFirst({
      where: {
        token: tableToken,
        isActive: true,
        branch: {
          code: branchCode,
          operatingMode: BranchOperatingMode.BBQ_WEIGH,
          brand: { code: brandCode },
        },
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            imageUrl: true,
            isOpen: true,
            isHidden: true,
            brand: { select: { id: true, code: true, name: true, color: true } },
          },
        },
        sessions: {
          where: { status: "OPEN" },
          include: {
            lines: { orderBy: { createdAt: "asc" } },
          },
          take: 1,
        },
      },
    });

    if (!table) return jsonError("ไม่พบโต๊ะหรือ QR ไม่ถูกต้อง", 404);
    if (table.branch.isHidden) {
      return jsonError("สาขานี้ไม่พร้อมให้บริการในขณะนี้", 403);
    }

    const open = table.sessions[0] ?? null;
    const lines =
      open?.lines.map((l) => ({
        id: l.id,
        itemName: l.itemName,
        kind: l.kind,
        quantity: l.quantity,
        weightKg: l.weightKg != null ? Number(l.weightKg) : null,
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.lineTotal),
        createdAt: l.createdAt,
      })) ?? [];

    return jsonOk({
      table: {
        id: table.id,
        name: table.name,
        token: table.token,
      },
      branch: table.branch,
      session: open
        ? {
            id: open.id,
            status: open.status,
            openedAt: open.openedAt,
            lines,
            runningTotal: sessionGrandTotal(lines, Number(open.discountAmount)),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Public: open a session for this table if none is open */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { brandCode, branchCode, tableToken } = await params;

    const table = await prisma.diningTable.findFirst({
      where: {
        token: tableToken,
        isActive: true,
        branch: {
          code: branchCode,
          operatingMode: BranchOperatingMode.BBQ_WEIGH,
          isHidden: false,
          brand: { code: brandCode },
        },
      },
    });
    if (!table) return jsonError("ไม่พบโต๊ะหรือ QR ไม่ถูกต้อง", 404);

    const existing = await prisma.tableSession.findFirst({
      where: { tableId: table.id, status: "OPEN" },
    });
    if (existing) {
      return jsonOk({ sessionId: existing.id, created: false });
    }

    const created = await prisma.tableSession.create({
      data: {
        branchId: table.branchId,
        tableId: table.id,
      },
    });

    return jsonOk({ sessionId: created.id, created: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

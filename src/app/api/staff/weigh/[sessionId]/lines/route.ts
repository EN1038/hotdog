import { z } from "zod";
import { TableSessionLineKind } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBbqWeighBranch } from "@/lib/bbq-branch";
import {
  computeSessionLineTotal,
  sessionGrandTotal,
} from "@/lib/table-session-totals";

type Params = { params: Promise<{ sessionId: string }> };

const addLineSchema = z.object({
  branchMenuItemId: z.string().min(1),
  weightKg: z.number().positive(),
});

function serializeSession(s: {
  id: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  paymentMethod: string | null;
  discountAmount: unknown;
  closedTotal: unknown;
  note: string | null;
  table: { id: string; name: string; token: string };
  lines: Array<{
    id: string;
    itemName: string;
    kind: TableSessionLineKind;
    quantity: number;
    weightKg: unknown;
    unitPrice: unknown;
    lineTotal: unknown;
    createdAt: Date;
  }>;
}) {
  const lines = s.lines.map((l) => ({
    ...l,
    weightKg: l.weightKg != null ? Number(l.weightKg) : null,
    unitPrice: Number(l.unitPrice),
    lineTotal: Number(l.lineTotal),
  }));
  const discount = Number(s.discountAmount);
  return {
    ...s,
    discountAmount: discount,
    closedTotal: s.closedTotal != null ? Number(s.closedTotal) : null,
    lines,
    runningTotal: sessionGrandTotal(lines, discount),
    itemsTotal: sessionGrandTotal(lines, 0),
  };
}

/** POST — add a weight line to an open staff weigh bill */
export async function POST(request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    const session = await requireStaff();
    const gate = await requireBbqWeighBranch(session.branchId);
    if ("error" in gate && gate.error) return gate.error;

    const open = await prisma.tableSession.findFirst({
      where: {
        id: sessionId,
        branchId: session.branchId,
        status: "OPEN",
      },
    });
    if (!open) return jsonError("ไม่พบบิลเปิด", 404);

    const body = addLineSchema.parse(await request.json());
    const menu = await prisma.branchMenuItem.findFirst({
      where: {
        id: body.branchMenuItemId,
        branchId: session.branchId,
        sellByWeight: true,
      },
    });
    if (!menu || menu.pricePerKg == null) {
      return jsonError("เมนูนี้ไม่ได้ตั้งราคาต่อกิโล", 400);
    }

    const unitPrice = Number(menu.pricePerKg);
    const lineTotal = computeSessionLineTotal({
      kind: TableSessionLineKind.WEIGHT,
      quantity: 1,
      weightKg: body.weightKg,
      unitPrice,
    });

    await prisma.tableSessionLine.create({
      data: {
        sessionId,
        branchMenuItemId: menu.id,
        itemName: menu.name,
        kind: TableSessionLineKind.WEIGHT,
        quantity: 1,
        weightKg: body.weightKg,
        unitPrice,
        lineTotal,
      },
    });

    const refreshed = await prisma.tableSession.findFirst({
      where: { id: sessionId, branchId: session.branchId },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!refreshed) return jsonError("ไม่พบบิล", 404);
    return jsonOk(serializeSession(refreshed), 201);
  } catch (error) {
    return handleApiError(error);
  }
}

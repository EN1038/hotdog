import { z } from "zod";
import { TableSessionLineKind } from "@prisma/client";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireBbqWeighBranch } from "@/lib/bbq-branch";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import {
  computeSessionLineTotal,
  sessionGrandTotal,
} from "@/lib/table-session-totals";

type Params = { params: Promise<{ id: string; sessionId: string }> };

const addLineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PIECE"),
    branchMenuItemId: z.string().optional().nullable(),
    itemName: z.string().min(1).optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal("WEIGHT"),
    branchMenuItemId: z.string().optional().nullable(),
    itemName: z.string().min(1).optional(),
    weightKg: z.number().positive(),
    unitPrice: z.number().positive().optional(),
  }),
]);

async function loadSession(branchId: string, sessionId: string) {
  return prisma.tableSession.findFirst({
    where: { id: sessionId, branchId },
    include: {
      table: { select: { id: true, name: true, token: true } },
      lines: { orderBy: { createdAt: "asc" } },
      closedByAdmin: { select: { id: true, username: true } },
    },
  });
}

function serializeSession(
  s: NonNullable<Awaited<ReturnType<typeof loadSession>>>,
) {
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

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId, sessionId } = await params;
    await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const session = await loadSession(branchId, sessionId);
    if (!session) return jsonError("ไม่พบบิล", 404);
    return jsonOk(serializeSession(session));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId, sessionId } = await params;
    const { session: adminSession } = await requireBranchAccess(branchId);
    const gate = await requireBbqWeighBranch(branchId);
    if ("error" in gate && gate.error) return gate.error;

    const open = await prisma.tableSession.findFirst({
      where: { id: sessionId, branchId, status: "OPEN" },
    });
    if (!open) return jsonError("ไม่พบบิลเปิด", 404);

    const body = addLineSchema.parse(await request.json());
    let itemName = body.itemName?.trim() || "";
    let unitPrice = body.unitPrice;
    let menuItemId = body.branchMenuItemId ?? null;

    if (menuItemId) {
      const menu = await prisma.branchMenuItem.findFirst({
        where: { id: menuItemId, branchId },
      });
      if (!menu) return jsonError("ไม่พบเมนู", 404);
      itemName = itemName || menu.name;
      if (body.kind === "WEIGHT") {
        if (!menu.sellByWeight || menu.pricePerKg == null) {
          return jsonError("เมนูนี้ไม่ได้ตั้งราคาต่อกิโล");
        }
        unitPrice = unitPrice ?? Number(menu.pricePerKg);
      } else {
        unitPrice =
          unitPrice ??
          Number(menu.storefrontPrice ?? menu.pickupPrice ?? menu.price);
      }
    }

    if (!itemName) return jsonError("ต้องระบุชื่อรายการ");
    if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return jsonError("ต้องระบุราคา");
    }

    const kind =
      body.kind === "WEIGHT"
        ? TableSessionLineKind.WEIGHT
        : TableSessionLineKind.PIECE;
    const quantity = body.kind === "PIECE" ? body.quantity : 1;
    const weightKg = body.kind === "WEIGHT" ? body.weightKg : null;
    const lineTotal = computeSessionLineTotal({
      kind,
      quantity,
      weightKg,
      unitPrice,
    });

    await prisma.tableSessionLine.create({
      data: {
        sessionId,
        branchMenuItemId: menuItemId,
        itemName,
        kind,
        quantity,
        weightKg,
        unitPrice,
        lineTotal,
        createdByAdminId: adminSession.adminId,
      },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(adminSession, {
      action: "bbq.session.add_line",
      summary:
        kind === "WEIGHT"
          ? `ชั่ง ${itemName} ${weightKg} กก. · บิล ${sessionId.slice(-6)}`
          : `เพิ่ม ${itemName} x${quantity} · บิล ${sessionId.slice(-6)}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "table_session",
      entityId: sessionId,
    });

    const refreshed = await loadSession(branchId, sessionId);
    if (!refreshed) return jsonError("ไม่พบบิล", 404);
    return jsonOk(serializeSession(refreshed), 201);
  } catch (error) {
    return handleApiError(error);
  }
}

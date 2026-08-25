import { z } from "zod";
import { TableSessionLineKind } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  ensureTakeawayDiningTable,
  requireBbqWeighBranch,
} from "@/lib/bbq-branch";
import {
  computeSessionLineTotal,
  sessionGrandTotal,
} from "@/lib/table-session-totals";

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

/** GET — tables, open sessions, weigh menus for staff counter */
export async function GET() {
  try {
    const { ensureProdSchemaCompat } = await import("@/lib/schema-compat");
    void ensureProdSchemaCompat();

    const session = await requireStaff();
    const gate = await requireBbqWeighBranch(session.branchId);
    if ("error" in gate && gate.error) return gate.error;

    const takeaway = await ensureTakeawayDiningTable(session.branchId);

    const [tables, openSessions, weighMenus] = await Promise.all([
      prisma.diningTable.findMany({
        where: { branchId: session.branchId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          token: true,
          sortOrder: true,
          sessions: {
            where: { status: "OPEN" },
            select: { id: true, openedAt: true },
            take: 1,
          },
        },
      }),
      prisma.tableSession.findMany({
        where: { branchId: session.branchId, status: "OPEN" },
        include: {
          table: { select: { id: true, name: true, token: true } },
          lines: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { openedAt: "desc" },
        take: 30,
      }),
      prisma.branchMenuItem.findMany({
        where: {
          branchId: session.branchId,
          isHidden: false,
          sellByWeight: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          pricePerKg: true,
          sellByWeight: true,
        },
      }),
    ]);

    return jsonOk({
      takeawayTableId: takeaway.id,
      tables: tables.map((t) => ({
        id: t.id,
        name: t.name,
        token: t.token,
        sortOrder: t.sortOrder,
        openSession: t.sessions[0]
          ? { id: t.sessions[0].id, openedAt: t.sessions[0].openedAt }
          : null,
      })),
      openSessions: openSessions.map((s) => serializeSession(s)),
      weighMenus: weighMenus.map((m) => ({
        id: m.id,
        name: m.name,
        pricePerKg: m.pricePerKg != null ? Number(m.pricePerKg) : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const openSchema = z.object({
  tableId: z.string().min(1).optional(),
  useTakeaway: z.boolean().optional(),
  note: z.string().max(500).optional().nullable(),
});

/** POST — open a weigh bill (defaults to ซื้อกลับบ้าน) */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    const gate = await requireBbqWeighBranch(session.branchId);
    if ("error" in gate && gate.error) return gate.error;

    const body = openSchema.parse(await request.json().catch(() => ({})));
    let tableId = body.tableId;
    if (body.useTakeaway || !tableId) {
      const takeaway = await ensureTakeawayDiningTable(session.branchId);
      tableId = takeaway.id;
    }

    const table = await prisma.diningTable.findFirst({
      where: { id: tableId, branchId: session.branchId, isActive: true },
    });
    if (!table) return jsonError("ไม่พบโต๊ะ", 404);

    const existingOpen = await prisma.tableSession.findFirst({
      where: { tableId: table.id, status: "OPEN" },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: { orderBy: { createdAt: "asc" } },
      },
    });
    if (existingOpen) {
      return jsonOk({
        ...serializeSession(existingOpen),
        created: false,
      });
    }

    const created = await prisma.tableSession.create({
      data: {
        branchId: session.branchId,
        tableId: table.id,
        note: body.note?.trim() || null,
      },
      include: {
        table: { select: { id: true, name: true, token: true } },
        lines: true,
      },
    });

    return jsonOk(
      {
        ...serializeSession({ ...created, lines: [] }),
        created: true,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

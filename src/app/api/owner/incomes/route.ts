import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { getActiveShift } from "@/lib/branch-shift";
import {
  bangkokDateKey,
  isBangkokDateKey,
} from "@/lib/constants";
import {
  incomeCreateSchema,
  incomeDateFromKey,
  serializeIncome,
  summarizeIncomes,
} from "@/lib/branch-income";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import {
  requireOwnerBranch,
  requireOwnerSession,
} from "@/lib/owner-accounts-access";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import { z } from "zod";

const ownerIncomeCreateSchema = incomeCreateSchema.extend({
  branchId: z.string().trim().min(1),
});

/** GET — list incomes for an owner-accessible branch. */
export async function GET(request: Request) {
  try {
    const { session, brandIds } = await requireOwnerSession();
    await ensureProdSchemaCompat().catch(() => null);
    const { searchParams } = new URL(request.url);
    const branch = await requireOwnerBranch(
      session,
      brandIds,
      searchParams.get("branchId"),
    );

    const dateParam = searchParams.get("date");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const channel = searchParams.get("payChannel");
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
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
      gte: incomeDateFromKey(fromKey),
      lte: new Date(`${toKey}T23:59:59.999+07:00`),
    };

    const rows = await prisma.branchIncome.findMany({
      where: {
        branchId: branch.id,
        incomeDate: dateFilter,
        ...(channel === "CASH" || channel === "TRANSFER"
          ? { payChannel: channel }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { note: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ incomeDate: "desc" }, { createdAt: "desc" }],
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
      },
    });

    const incomes = rows.map(serializeIncome);
    return jsonOk({
      from: fromKey,
      to: toKey,
      date: fromKey === toKey ? fromKey : undefined,
      branchId: branch.id,
      incomes,
      summary: summarizeIncomes(incomes),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — owner creates an income (createdByAdminId). */
export async function POST(request: Request) {
  try {
    const { session, brandIds } = await requireOwnerSession();
    await ensureProdSchemaCompat().catch(() => null);
    const body = ownerIncomeCreateSchema.parse(await request.json());
    const branch = await requireOwnerBranch(session, brandIds, body.branchId);
    await assertBrandWriteAllowedByBranchId(branch.id);
    const activeShift = await getActiveShift(branch.id);

    const created = await prisma.branchIncome.create({
      data: {
        branchId: branch.id,
        shiftId: activeShift?.id ?? null,
        title: body.title,
        amount: body.amount,
        payChannel: body.payChannel,
        incomeDate: incomeDateFromKey(body.incomeDate),
        note: body.note?.trim() || null,
        createdByAdminId: session.adminId!,
      },
      include: {
        createdByStaff: { select: { name: true } },
        createdByAdmin: { select: { username: true } },
      },
    });

    return jsonOk({ income: serializeIncome(created) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

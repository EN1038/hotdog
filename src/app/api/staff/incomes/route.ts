import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
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
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

/** GET — list branch incomes for a date range (default today → today). */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    await ensureProdSchemaCompat().catch(() => null);
    const { searchParams } = new URL(request.url);
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
        branchId: session.branchId,
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
      incomes,
      summary: summarizeIncomes(incomes),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — create an income for the staff branch. */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    await ensureProdSchemaCompat().catch(() => null);
    await assertBrandWriteAllowedByBranchId(session.branchId);
    const body = incomeCreateSchema.parse(await request.json());
    const activeShift = await getActiveShift(session.branchId);

    const created = await prisma.branchIncome.create({
      data: {
        branchId: session.branchId,
        shiftId: activeShift?.id ?? null,
        title: body.title,
        amount: body.amount,
        payChannel: body.payChannel,
        incomeDate: incomeDateFromKey(body.incomeDate),
        note: body.note?.trim() || null,
        createdByStaffId: session.staffId,
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

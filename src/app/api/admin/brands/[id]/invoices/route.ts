import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { BRAND_PLAN_PRICES } from "@/lib/brand-plan-shared";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  amountBaht: z.number().min(0).max(1_000_000),
  periodLabel: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["DRAFT", "ISSUED", "PAID", "VOID"]).optional(),
  markPaid: z.boolean().optional(),
});

async function nextInvoiceNumber(brandId: string) {
  const now = new Date();
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .replace("-", "");
  const prefix = `INV-${ym}-`;
  const latest = await prisma.brandInvoice.findFirst({
    where: { brandId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = latest
    ? Number(latest.number.slice(prefix.length)) + 1 || 1
    : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await requirePlatformAdmin();
    const { id: brandId } = await params;
    const rows = await prisma.brandInvoice.findMany({
      where: { brandId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonOk({
      invoices: rows.map((row) => ({
        id: row.id,
        number: row.number,
        title: row.title,
        amountBaht: Number(row.amountBaht),
        status: row.status,
        periodLabel: row.periodLabel,
        issuedAt: row.issuedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id: brandId } = await params;
    const body = createSchema.parse(await request.json());

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, plan: true },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    const status =
      body.markPaid === true ? "PAID" : (body.status ?? "ISSUED");
    const now = new Date();
    const number = await nextInvoiceNumber(brandId);

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.brandInvoice.create({
        data: {
          brandId,
          number,
          title: body.title.trim(),
          amountBaht: body.amountBaht,
          status,
          periodLabel: body.periodLabel?.trim() || null,
          note: body.note?.trim() || null,
          issuedAt: status === "DRAFT" ? null : now,
          paidAt: status === "PAID" ? now : null,
          createdByAdminId: session.adminId,
        },
      });
      if (status === "PAID") {
        await tx.brand.update({
          where: { id: brandId },
          data: {
            lastPaidAt: now,
            status: "ACTIVE",
          },
        });
      }
      return created;
    });

    await logAdminActivity(session, {
      action: "brand.invoice.create",
      summary: `สร้างใบแจ้งหนี้ ${number} · ${brand.name}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "brand_invoice",
      entityId: invoice.id,
      entityName: number,
      metadata: {
        amountBaht: body.amountBaht,
        status,
        suggested: BRAND_PLAN_PRICES[brand.plan],
      },
    });

    return jsonOk(
      {
        invoice: {
          id: invoice.id,
          number: invoice.number,
          title: invoice.title,
          amountBaht: Number(invoice.amountBaht),
          status: invoice.status,
          periodLabel: invoice.periodLabel,
          issuedAt: invoice.issuedAt?.toISOString() ?? null,
          paidAt: invoice.paidAt?.toISOString() ?? null,
          note: invoice.note,
          createdAt: invoice.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

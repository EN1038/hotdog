import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string; invoiceId: string }> };

const patchSchema = z.object({
  status: z.enum(["DRAFT", "ISSUED", "PAID", "VOID"]).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  amountBaht: z.number().min(0).max(1_000_000).optional(),
  periodLabel: z.string().trim().max(80).nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id: brandId, invoiceId } = await params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.brandInvoice.findFirst({
      where: { id: invoiceId, brandId },
      include: { brand: { select: { id: true, name: true } } },
    });
    if (!existing) return jsonError("ไม่พบใบแจ้งหนี้", 404);

    const now = new Date();
    const nextStatus = body.status ?? existing.status;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.brandInvoice.update({
        where: { id: invoiceId },
        data: {
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.amountBaht !== undefined && {
            amountBaht: body.amountBaht,
          }),
          ...(body.periodLabel !== undefined && {
            periodLabel: body.periodLabel?.trim() || null,
          }),
          ...(body.note !== undefined && {
            note: body.note?.trim() || null,
          }),
          ...(body.status !== undefined && {
            status: body.status,
            issuedAt:
              body.status === "DRAFT"
                ? null
                : existing.issuedAt ?? now,
            paidAt:
              body.status === "PAID"
                ? existing.paidAt ?? now
                : body.status === "VOID" || body.status === "ISSUED"
                  ? null
                  : existing.paidAt,
          }),
        },
      });

      if (nextStatus === "PAID") {
        await tx.brand.update({
          where: { id: brandId },
          data: {
            lastPaidAt: row.paidAt ?? now,
            status: "ACTIVE",
          },
        });
      }
      return row;
    });

    await logAdminActivity(session, {
      action: "brand.invoice.update",
      summary: `อัปเดตใบแจ้งหนี้ ${updated.number} · ${existing.brand.name}`,
      brandId: existing.brand.id,
      brandName: existing.brand.name,
      entityType: "brand_invoice",
      entityId: updated.id,
      entityName: updated.number,
      metadata: body,
    });

    return jsonOk({
      invoice: {
        id: updated.id,
        number: updated.number,
        title: updated.title,
        amountBaht: Number(updated.amountBaht),
        status: updated.status,
        periodLabel: updated.periodLabel,
        issuedAt: updated.issuedAt?.toISOString() ?? null,
        paidAt: updated.paidAt?.toISOString() ?? null,
        note: updated.note,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

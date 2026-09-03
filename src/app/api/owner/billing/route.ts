import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

export async function GET(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireAdmin();
    if (session.isPlatformAdmin) {
      return jsonError("ใช้หน้าแอดมินแพลตฟอร์มสำหรับบิล", 403);
    }

    const accessible = getAccessibleBrandIds(session) ?? [];
    if (accessible.length === 0) {
      return jsonError("บัญชีนี้ยังไม่ได้ผูกกับร้าน", 403);
    }

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("brandId")?.trim();
    const brandId =
      requested && accessible.includes(requested)
        ? requested
        : accessible[0]!;

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        id: true,
        name: true,
        nextDueAt: true,
        lastPaidAt: true,
        billingNote: true,
        contactPhone: true,
      },
    });
    if (!brand) return jsonError("ไม่พบร้าน", 404);

    const rows = await prisma.brandInvoice.findMany({
      where: {
        brandId,
        status: { in: ["ISSUED", "PAID", "VOID"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return jsonOk({
      brandId: brand.id,
      brandName: brand.name,
      nextDueAt: brand.nextDueAt?.toISOString() ?? null,
      lastPaidAt: brand.lastPaidAt?.toISOString() ?? null,
      contactPhone: brand.contactPhone,
      invoices: rows.map((row) => ({
        id: row.id,
        number: row.number,
        title: row.title,
        amountBaht: Number(row.amountBaht),
        status: row.status,
        periodLabel: row.periodLabel,
        issuedAt: row.issuedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

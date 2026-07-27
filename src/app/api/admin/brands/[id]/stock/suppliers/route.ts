import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { createSupplier, StockError } from "@/lib/stock-advanced";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  address: z.string().trim().max(300).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const suppliers = await prisma.supplier.findMany({
      where: { brandId: id },
      orderBy: { name: "asc" },
    });
    return jsonOk(suppliers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = createSchema.parse(await request.json());
    const supplier = await createSupplier({
      brandId: id,
      name: body.name,
      code: body.code,
      phone: body.phone,
      email: body.email || null,
      address: body.address,
      note: body.note,
    });
    const brand = await prisma.brand.findUnique({ where: { id } });
    await logAdminActivity(session, {
      action: "brand.supplier.create",
      summary: `เพิ่มผู้ขาย ${supplier.name}`,
      brandId: id,
      brandName: brand?.name ?? null,
      entityType: "supplier",
      entityId: supplier.id,
      entityName: supplier.name,
    });
    return jsonOk(supplier, 201);
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, error.status);
    return handleApiError(error);
  }
}

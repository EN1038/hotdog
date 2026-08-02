import { z } from "zod";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { logAdminActivity } from "@/lib/admin-activity";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const createSchema = z.object({
  name: z.string().trim().min(1, "กรุณาระบุชื่อรายการ").max(120),
  description: z.string().trim().max(500).nullable().optional(),
  unit: z.string().trim().min(1, "กรุณาระบุหน่วย").max(40),
  price: z.union([z.number(), z.string()]).optional().nullable(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  stockType: z.enum(["CONSUMABLE", "EQUIPMENT"], {
    message: "ประเภทต้องเป็นของสิ้นเปลืองหรืออุปกรณ์",
  }),
  showOnKeyOrder: z.boolean().optional(),
  keyOrderSortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { session } = await requireBranchAccess(id);

    const body = createSchema.parse(await req.json());
    const priceRaw = body.price;
    const priceNum =
      priceRaw === null || priceRaw === undefined || priceRaw === ""
        ? null
        : Number(priceRaw);
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) {
      return jsonError("ราคาไม่ถูกต้อง");
    }

    const branch = await prisma.branch.findUnique({
      where: { id },
      select: { id: true, name: true, brandId: true },
    });
    if (!branch) {
      return jsonError("ไม่พบสาขา", 404);
    }

    const item = await prisma.branchNonMenuItem.create({
      data: {
        branchId: branch.id,
        name: body.name,
        description: body.description?.trim() || null,
        unit: body.unit,
        price: priceNum != null ? new Prisma.Decimal(priceNum) : null,
        imageUrl: body.imageUrl?.trim() || null,
        stockType: body.stockType,
        quantity: 0,
        showOnKeyOrder:
          body.stockType === "CONSUMABLE"
            ? Boolean(body.showOnKeyOrder)
            : false,
        keyOrderSortOrder: body.keyOrderSortOrder ?? 0,
      },
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `เพิ่มรายการ: ${item.name} ในสาขา ${branch.name}`,
      brandId: branch.brandId,
      branchId: branch.id,
      entityType: "BRANCH_NON_MENU_ITEM",
      entityId: item.id,
      entityName: item.name,
    });

    return jsonOk({ success: true, item }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

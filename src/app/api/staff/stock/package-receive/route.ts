import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import {
  generateStockDocumentNo,
  stockDocumentNoSchema,
  validateStockDocumentNo,
} from "@/lib/stock-document-no";
import { lookupStockItemByCode } from "@/lib/stock-menu-lookup";
import {
  labelPreviewPayload,
  resolveBrandStockLabel,
} from "@/lib/stock-label-resolve";

const postSchema = z.object({
  labelId: z.string().trim().min(1),
  labelCode: z.string().trim().min(1).optional(),
  qrPayload: z.string().trim().min(1).optional(),
  documentNo: stockDocumentNoSchema.optional(),
});

function receiveValidationError(
  label: NonNullable<Awaited<ReturnType<typeof resolveBrandStockLabel>>>,
  receivingBranchId: string,
): string | null {
  if (label.branchId === receivingBranchId) {
    return "ไม่สามารถรับแพ็กที่ผลิตที่สาขานี้เอง — ใช้เมนู «รับเข้าแพ็ก» สำหรับแพ็กใหม่";
  }
  if (label.receivedBranchId) {
    return `ป้ายนี้รับเข้าที่ ${label.receivedBranch?.name ?? "สาขาอื่น"} แล้ว`;
  }
  if (label.status !== "CONSUMED") {
    return "แพ็กนี้ยังไม่ได้จ่ายออกจากคลัง — ให้คลังยืนยันจ่ายออกก่อน";
  }
  return null;
}

/** GET — preview pack for branch receive (from other packing branch) */
export async function GET(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const qr = searchParams.get("qr")?.trim();
    const labelCode = searchParams.get("labelCode")?.trim();

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, brandId: true, stockEnabled: true },
    });
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);
    if (!branch.stockEnabled) {
      return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
    }

    const label = await resolveBrandStockLabel({
      brandId: branch.brandId,
      qrPayload: qr,
      labelCode,
    });
    if (!label) return jsonError("ไม่พบป้ายแพ็ก", 404);

    const validationError = receiveValidationError(label, branch.id);
    if (validationError) return jsonError(validationError, 400);

    return jsonOk(labelPreviewPayload(label));
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — receive shipped pack into branch stock */
export async function POST(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireStaff();
    await assertBrandWriteAllowedByBranchId(session.branchId);

    const body = postSchema.parse(await request.json());
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, code: true, brandId: true, stockEnabled: true },
    });
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);
    if (!branch.stockEnabled) {
      return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
    }

    const label = await resolveBrandStockLabel({
      brandId: branch.brandId,
      labelId: body.labelId,
      labelCode: body.labelCode,
      qrPayload: body.qrPayload,
    });
    if (!label) return jsonError("ไม่พบป้ายแพ็ก", 404);

    const validationError = receiveValidationError(label, branch.id);
    if (validationError) return jsonError(validationError, 400);

    const match = await lookupStockItemByCode({
      branchId: branch.id,
      code: label.productCode,
    });
    if (!match) {
      return jsonError(
        `ไม่พบสินค้า ${label.productCode} ในสาขานี้ — ตั้งรหัสสินค้าให้ตรงก่อนรับแพ็ก`,
        404,
      );
    }

    let documentNo = body.documentNo?.trim() ?? "";
    if (!documentNo) {
      documentNo = await generateStockDocumentNo({
        kind: "IN",
        branchCode: branch.code ?? "",
        branchId: branch.id,
      });
    } else {
      try {
        documentNo = await validateStockDocumentNo({
          documentNo,
          action: "stock_in",
        });
      } catch (e) {
        return jsonError(
          e instanceof Error ? e.message : "เลขที่เอกสารไม่ถูกต้อง",
        );
      }
    }

    const batchId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `recv-${Date.now()}`;

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.stockLabel.findUnique({
        where: { id: label.id },
        select: { receivedBranchId: true, status: true, branchId: true },
      });
      if (!fresh) throw new Error("ไม่พบป้ายแพ็ก");
      if (fresh.branchId === branch.id) {
        throw new Error("ไม่สามารถรับแพ็กที่ผลิตที่สาขานี้เอง");
      }
      if (fresh.receivedBranchId) {
        throw new Error("ป้ายนี้รับเข้าแล้ว");
      }
      if (fresh.status !== "CONSUMED") {
        throw new Error("แพ็กนี้ยังไม่ได้จ่ายออกจากคลัง");
      }

      if (match.stockType === "SALE_ITEM") {
        const menuItem = await tx.branchMenuItem.findFirst({
          where: { id: match.itemId, branchId: branch.id },
          include: { stock: true },
        });
        if (!menuItem) throw new Error("ไม่พบเมนูในสาขานี้");

        const oldQty = menuItem.stock?.quantity ?? 0;
        const newQty = oldQty + label.quantity;
        await tx.branchMenuItemStock.upsert({
          where: { menuItemId: menuItem.id },
          update: { quantity: newQty },
          create: {
            branchId: branch.id,
            menuItemId: menuItem.id,
            quantity: newQty,
          },
        });
        await tx.branchMenuItem.update({
          where: { id: menuItem.id },
          data: { isOutOfStock: newQty <= 0 },
        });
        await tx.branchMenuItemStockHistory.create({
          data: {
            branchId: branch.id,
            menuItemId: menuItem.id,
            quantity: label.quantity,
            type: "STOCK_IN",
            note: `รับแพ็ก ${label.labelCode} จาก ${label.branch.name}`,
            batchId,
            documentNo,
            createdByStaffId: session.staffId,
          },
        });
      } else {
        const nonMenu = await tx.branchNonMenuItem.findFirst({
          where: { id: match.itemId, branchId: branch.id },
        });
        if (!nonMenu) throw new Error("ไม่พบรายการในสาขานี้");

        const newQty = nonMenu.quantity + label.quantity;
        await tx.branchNonMenuItem.update({
          where: { id: nonMenu.id },
          data: { quantity: newQty },
        });
        await tx.branchNonMenuItemHistory.create({
          data: {
            branchNonMenuItemId: nonMenu.id,
            quantity: label.quantity,
            type: "STOCK_IN",
            note: `รับแพ็ก ${label.labelCode} จาก ${label.branch.name}`,
            batchId,
            documentNo,
            createdByStaffId: session.staffId,
          },
        });
      }

      await tx.stockLabel.update({
        where: { id: label.id },
        data: {
          receivedBranchId: branch.id,
          receivedAt: new Date(),
          receivedByStaffId: session.staffId,
        },
      });
    });

    return jsonOk({
      ok: true,
      documentNo,
      label: {
        id: label.id,
        labelCode: label.labelCode,
        productName: label.productName,
        quantity: label.quantity,
        unit: label.unit,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

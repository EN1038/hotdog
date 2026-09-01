import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import {
  generateStockDocumentNo,
  stockDocumentNoSchema,
  validateStockDocumentNo,
} from "@/lib/stock-document-no";
import {
  parseStockLabelQrPayload,
  stockLabelQrPayload,
} from "@/lib/stock-label";
import {
  labelPreviewPayload,
  resolveBrandStockLabel,
} from "@/lib/stock-label-resolve";

const postSchema = z.object({
  labelCode: z.string().trim().min(1).optional(),
  qrPayload: z.string().trim().min(1).optional(),
  labelId: z.string().trim().min(1).optional(),
  documentNo: stockDocumentNoSchema.optional(),
  note: z.string().trim().min(1).max(300),
});

async function resolveLabel(input: {
  branchId: string;
  labelCode?: string;
  qrPayload?: string;
  labelId?: string;
}) {
  if (input.labelId) {
    return prisma.stockLabel.findFirst({
      where: { id: input.labelId, branchId: input.branchId },
    });
  }

  const fromQr = input.qrPayload
    ? parseStockLabelQrPayload(input.qrPayload)
    : null;
  if (fromQr) {
    return prisma.stockLabel.findFirst({
      where: {
        id: fromQr.id,
        branchId: input.branchId,
        ...(fromQr.labelCode ? { labelCode: fromQr.labelCode } : {}),
      },
    });
  }

  const code = input.labelCode?.trim();
  if (!code) return null;

  return prisma.stockLabel.findFirst({
    where: { branchId: input.branchId, labelCode: code },
  });
}

/** POST — consume package label (issue out from stock) */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    await assertBrandWriteAllowedByBranchId(session.branchId);

    const body = postSchema.parse(await request.json());
    if (!body.labelCode && !body.qrPayload && !body.labelId) {
      return jsonError("ต้องระบุรหัสป้ายหรือสแกน QR");
    }

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, code: true, stockEnabled: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (!branch.stockEnabled) {
      return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
    }

    const label = await resolveLabel({
      branchId: session.branchId,
      labelCode: body.labelCode,
      qrPayload: body.qrPayload,
      labelId: body.labelId,
    });
    if (!label) return jsonError("ไม่พบป้ายรายการนี้", 404);
    if (label.status === "CONSUMED") {
      return jsonError("ป้ายนี้จ่ายออกแล้ว");
    }
    if (label.status === "VOID") {
      return jsonError("ป้ายนี้ถูกยกเลิกแล้ว");
    }

    let documentNo = body.documentNo?.trim() ?? "";
    if (!documentNo) {
      documentNo = await generateStockDocumentNo({
        kind: "OUT",
        branchCode: branch.code ?? "",
        branchId: branch.id,
      });
    } else {
      try {
        documentNo = await validateStockDocumentNo({
          documentNo,
          action: "issue",
        });
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "เลขที่เอกสารไม่ถูกต้อง");
      }
    }

    const batchId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `out-${Date.now()}`;

    await prisma.$transaction(async (tx) => {
      if (label.menuItemId) {
        const menuItem = await tx.branchMenuItem.findFirst({
          where: { id: label.menuItemId, branchId: branch.id },
          include: { stock: true },
        });
        if (!menuItem) throw new Error("ไม่พบเมนูที่ผูกกับป้าย");

        const oldQty = menuItem.stock?.quantity ?? 0;
        const newQty = Math.max(0, oldQty - label.quantity);

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
            quantity: -label.quantity,
            type: "ISSUE",
            note: `จ่ายรายการ ${label.labelCode}: ${body.note}`,
            batchId,
            documentNo,
            createdByStaffId: session.staffId,
          },
        });
      } else if (label.nonMenuItemId) {
        const item = await tx.branchNonMenuItem.findFirst({
          where: { id: label.nonMenuItemId, branchId: branch.id },
        });
        if (!item) throw new Error("ไม่พบรายการที่ผูกกับป้าย");

        const newQty = Math.max(0, item.quantity - label.quantity);
        await tx.branchNonMenuItem.update({
          where: { id: item.id },
          data: { quantity: newQty },
        });

        await tx.branchNonMenuItemHistory.create({
          data: {
            branchNonMenuItemId: item.id,
            quantity: -label.quantity,
            type: "ISSUE",
            note: `จ่ายรายการ ${label.labelCode}: ${body.note}`,
            batchId,
            documentNo,
            createdByStaffId: session.staffId,
          },
        });
      }

      await tx.stockLabel.update({
        where: { id: label.id },
        data: {
          status: "CONSUMED",
          consumedAt: new Date(),
          consumedByStaffId: session.staffId,
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
        qrPayload: stockLabelQrPayload({
          id: label.id,
          labelCode: label.labelCode,
        }),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** GET — lookup label by QR or label code for scan preview */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const { searchParams } = new URL(request.url);
    const qr = searchParams.get("qr")?.trim();
    const labelCode = searchParams.get("labelCode")?.trim();
    if (!qr && !labelCode) {
      return jsonError("กรุณากรอกรหัสป้ายหรือสแกน QR");
    }

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, brandId: true },
    });
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);

    const label = await resolveBrandStockLabel({
      brandId: branch.brandId,
      qrPayload: qr,
      labelCode,
    });
    if (!label || label.branchId !== session.branchId) {
      return jsonError("ไม่พบรายการในสาขานี้", 404);
    }

    return jsonOk(labelPreviewPayload(label));
  } catch (error) {
    return handleApiError(error);
  }
}

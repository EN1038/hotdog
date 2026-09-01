import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import {
  bangkokDateKey,
  startOfBangkokDayFromKey,
} from "@/lib/constants";
import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";
import {
  generateStockDocumentNo,
  stockDocumentNoSchema,
  validateStockDocumentNo,
} from "@/lib/stock-document-no";
import {
  generateLabelCode,
  generateLotNumber,
  stockLabelQrPayload,
} from "@/lib/stock-label";
import { labelsToPrintInput } from "@/lib/stock-package-label-print";

const lineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  shelfLifeDays: z.number().int().min(0).max(365).nullable().optional(),
});

const postSchema = z.object({
  documentNo: stockDocumentNoSchema.optional(),
  batchId: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  producedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sourceBranchId: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1).max(50),
  printOnly: z.boolean().optional(),
});

/** GET — metadata for package-in form (brand, source branches) */
export async function GET() {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        brandId: true,
        stockEnabled: true,
        brand: { select: { id: true, name: true, nameTh: true } },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (!branch.stockEnabled) {
      return jsonOk({ stockActive: false, branch, sourceBranches: [] });
    }

    let sourceBranches: Array<{ id: string; name: string; kind: string }> =
      [];
    if (branch.brandId) {
      sourceBranches = await prisma.branch.findMany({
        where: {
          brandId: branch.brandId,
          kind: "WAREHOUSE",
          isHidden: false,
        },
        select: { id: true, name: true, kind: true },
        orderBy: { name: "asc" },
      });
    }

    const defaultSourceId =
      branch.kind === "WAREHOUSE"
        ? branch.id
        : (sourceBranches[0]?.id ?? null);

    return jsonOk({
      stockActive: true,
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        kind: branch.kind,
      },
      brandName: branch.brand?.nameTh ?? branch.brand?.name ?? null,
      sourceBranches,
      defaultSourceId,
      producedAt: bangkokDateKey(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST — create package labels + stock_in */
export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    await assertBrandWriteAllowedByBranchId(session.branchId);

    const body = postSchema.parse(await request.json());
    const producedAtKey = body.producedAt ?? bangkokDateKey();
    if (producedAtKey > bangkokDateKey()) {
      return jsonError("วันที่ผลิตต้องไม่เกินวันนี้");
    }

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        brandId: true,
        stockEnabled: true,
        brand: { select: { name: true, nameTh: true } },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (!branch.stockEnabled) {
      return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
    }

    let sourceBranch: { id: string; name: string } | null = null;
    if (body.sourceBranchId) {
      sourceBranch = await prisma.branch.findFirst({
        where: {
          id: body.sourceBranchId,
          brandId: branch.brandId ?? undefined,
        },
        select: { id: true, name: true },
      });
    }
    if (!sourceBranch && branch.kind === "WAREHOUSE") {
      sourceBranch = { id: branch.id, name: branch.name };
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
        return jsonError(e instanceof Error ? e.message : "เลขที่เอกสารไม่ถูกต้อง");
      }
    }

    const batchId =
      body.batchId ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `batch-${Date.now()}`);

    const brandName = branch.brand?.nameTh ?? branch.brand?.name ?? null;
    const producedAt = startOfBangkokDayFromKey(producedAtKey);
    const lotNumber = await generateLotNumber({
      branchId: branch.id,
      producedAt: producedAtKey,
    });

    const createdLabels: Array<{
      id: string;
      labelCode: string;
      productName: string;
      productCode: string;
      brandName: string | null;
      sourceBranchName: string | null;
      quantity: number;
      unit: string;
      producedAt: Date | null;
      lotNumber: string;
    }> = [];

    await prisma.$transaction(async (tx) => {
      for (const line of body.lines) {
        const nonMenu = await tx.branchNonMenuItem.findFirst({
          where: { id: line.itemId, branchId: branch.id },
        });

        if (nonMenu) {
          const oldQty = nonMenu.quantity;
          const newQty = body.printOnly ? oldQty : oldQty + line.quantity;

          if (!body.printOnly) {
            await tx.branchNonMenuItem.update({
              where: { id: nonMenu.id },
              data: { quantity: newQty },
            });

            await tx.branchNonMenuItemHistory.create({
              data: {
                branchNonMenuItemId: nonMenu.id,
                quantity: line.quantity,
                type: "STOCK_IN",
                note: "รับเข้าแพ็ก",
                batchId,
                documentNo,
                createdByStaffId: session.staffId,
              },
            });
          }

          const labelCode = await generateLabelCode({
            branchId: branch.id,
            branchCode: branch.code ?? "",
            lotNumber,
          });

          const productCode =
            nonMenu.itemCode?.trim() || nonMenu.id.slice(-8).toUpperCase();

          const label = await tx.stockLabel.create({
            data: {
              branchId: branch.id,
              sourceBranchId: sourceBranch?.id ?? null,
              labelCode,
              lotNumber,
              nonMenuItemId: nonMenu.id,
              productName: nonMenu.name,
              productCode,
              brandName,
              sourceBranchName: sourceBranch?.name ?? null,
              quantity: line.quantity,
              unit: nonMenu.unit,
              producedAt,
              documentNo,
              batchId,
              createdByStaffId: session.staffId,
              printedAt: new Date(),
            },
          });
          createdLabels.push(label);
          continue;
        }

        const menuItem = await tx.branchMenuItem.findFirst({
          where: { id: line.itemId, branchId: branch.id },
          include: {
            stock: true,
            brandProduct: {
              select: { id: true, sku: true, barcode: true },
            },
          },
        });
        if (!menuItem) {
          throw new Error(`ไม่พบรายการสินค้า: ${line.itemId}`);
        }

        const shelfDays =
          line.shelfLifeDays != null
            ? line.shelfLifeDays
            : menuItem.defaultShelfLifeDays;

        let expiresAt: Date | null = null;
        if (shelfDays != null && shelfDays >= 0) {
          const receiveNoon = new Date(`${producedAtKey}T12:00:00+07:00`);
          receiveNoon.setDate(receiveNoon.getDate() + shelfDays);
          expiresAt = startOfBangkokDayFromKey(bangkokDateKey(receiveNoon));
        }

        const oldQty = menuItem.stock?.quantity ?? 0;
        const newQty = body.printOnly ? oldQty : oldQty + line.quantity;

        if (!body.printOnly) {
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

          const history = await tx.branchMenuItemStockHistory.create({
            data: {
              branchId: branch.id,
              menuItemId: menuItem.id,
              quantity: line.quantity,
              type: "STOCK_IN",
              note: "รับเข้าแพ็ก",
              batchId,
              documentNo,
              receivedAt: producedAt,
              expiresAt,
              createdByStaffId: session.staffId,
            },
          });

          const labelCode = await generateLabelCode({
            branchId: branch.id,
            branchCode: branch.code ?? "",
            lotNumber,
          });

          const productCode = resolveMenuItemProductCode({
            id: menuItem.id,
            itemCode: menuItem.itemCode,
            brandProduct: menuItem.brandProduct,
          });

          const label = await tx.stockLabel.create({
            data: {
              branchId: branch.id,
              sourceBranchId: sourceBranch?.id ?? null,
              labelCode,
              lotNumber,
              menuItemId: menuItem.id,
              brandProductId: menuItem.brandProductId,
              productName: menuItem.name,
              productCode,
              brandName,
              sourceBranchName: sourceBranch?.name ?? null,
              quantity: line.quantity,
              unit: "ชิ้น",
              producedAt,
              expiresAt,
              documentNo,
              batchId,
              menuStockHistoryId: history.id,
              createdByStaffId: session.staffId,
              printedAt: new Date(),
            },
          });
          createdLabels.push(label);
        } else {
          const labelCode = await generateLabelCode({
            branchId: branch.id,
            branchCode: branch.code ?? "",
            lotNumber,
          });
          const productCode = resolveMenuItemProductCode({
            id: menuItem.id,
            itemCode: menuItem.itemCode,
            brandProduct: menuItem.brandProduct,
          });
          const label = await tx.stockLabel.create({
            data: {
              branchId: branch.id,
              sourceBranchId: sourceBranch?.id ?? null,
              labelCode,
              lotNumber,
              menuItemId: menuItem.id,
              brandProductId: menuItem.brandProductId,
              productName: menuItem.name,
              productCode,
              brandName,
              sourceBranchName: sourceBranch?.name ?? null,
              quantity: line.quantity,
              unit: "ชิ้น",
              producedAt,
              expiresAt,
              documentNo,
              batchId,
              createdByStaffId: session.staffId,
              printedAt: new Date(),
            },
          });
          createdLabels.push(label);
        }
      }
    });

    const printLabels = labelsToPrintInput(createdLabels).map((l, i) => ({
      ...l,
      qrPayload: stockLabelQrPayload({
        id: createdLabels[i].id,
        labelCode: createdLabels[i].labelCode,
      }),
    }));

    return jsonOk(
      {
        ok: true,
        documentNo,
        batchId,
        lotNumber,
        packageCount: createdLabels.length,
        totalQty: createdLabels.reduce((s, l) => s + l.quantity, 0),
        labels: printLabels,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { isStockLabelQrPayload } from "@/lib/stock-label-qr";
import {
  lookupStockItemByCode,
  lookupStockItemById,
} from "@/lib/stock-menu-lookup";
import { parseStockMenuQrPayload } from "@/lib/stock-menu-qr";

/** GET ?qr= — resolve menu / stock item from menu sticker QR only */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const qr = new URL(request.url).searchParams.get("qr")?.trim();
    const code = new URL(request.url).searchParams.get("code")?.trim();

    if (code) {
      const branch = await prisma.branch.findUnique({
        where: { id: session.branchId },
        select: { id: true, stockEnabled: true },
      });
      if (!branch) return jsonError("ไม่พบสาขา", 404);
      if (!branch.stockEnabled) {
        return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
      }

      const match = await lookupStockItemByCode({
        branchId: branch.id,
        code,
      });
      if (!match) {
        return jsonError("ไม่พบรหัสสินค้าในสาขานี้", 404);
      }
      return jsonOk(match);
    }

    if (!qr) return jsonError("กรุณากรอกรหัสสินค้าหรือสแกน QR");

    if (isStockLabelQrPayload(qr)) {
      return jsonError(
        "นี่คือ QR ป้ายรายการ — ใช้เมนูจ่ายออกรายการ",
        400,
      );
    }

    const parsed = parseStockMenuQrPayload(qr);
    if (!parsed) {
      return jsonError("QR ไม่ถูกต้อง — สแกนจากป้ายเมนู/สินค้าเท่านั้น", 400);
    }

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, stockEnabled: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (!branch.stockEnabled) {
      return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
    }

    let match =
      parsed.itemId != null
        ? await lookupStockItemById({
            branchId: branch.id,
            itemId: parsed.itemId,
          })
        : null;

    if (!match && parsed.productCode) {
      match = await lookupStockItemByCode({
        branchId: branch.id,
        code: parsed.productCode,
      });
    }

    if (!match) {
      return jsonError("ไม่พบรายการเมนูในสาขานี้", 404);
    }

    return jsonOk(match);
  } catch (error) {
    return handleApiError(error);
  }
}

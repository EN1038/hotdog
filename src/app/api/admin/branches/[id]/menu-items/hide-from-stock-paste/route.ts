import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import {
  matchSoldOutMenus,
  parseSoldOutLines,
} from "@/lib/menu-stock-paste";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  text: z.string().min(1).max(50_000),
  /** If false, only preview matches without writing */
  apply: z.boolean().default(true),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = bodySchema.parse(await request.json());

    const soldOut = parseSoldOutLines(body.text);
    if (soldOut.length === 0) {
      return jsonError(
        "ไม่พบรายการที่ลงท้ายด้วยคำว่า \"หมด\" ในข้อความที่วาง",
        400,
      );
    }

    const menus = await prisma.branchMenuItem.findMany({
      where: { branchId },
      select: { id: true, name: true, isHidden: true },
    });

    const matched = matchSoldOutMenus(soldOut, menus);

    if (!body.apply) {
      return jsonOk({
        applied: false,
        hiddenCount: 0,
        ...matched,
      });
    }

    if (matched.toHide.length === 0) {
      return jsonOk({
        applied: true,
        hiddenCount: 0,
        ...matched,
      });
    }

    const ids = matched.toHide.map((m) => m.id);
    await prisma.branchMenuItem.updateMany({
      where: { branchId, id: { in: ids } },
      data: { isHidden: true, isOutOfStock: false },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "menu.update",
      summary: `ซ่อนเมนูจากข้อความสต็อก ${matched.toHide.length} รายการ`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "menu",
      entityId: branchId,
      entityName: ctx?.name ?? null,
      metadata: {
        hiddenNames: matched.toHide.map((m) => m.name),
        notFound: matched.notFound.map((n) => n.name),
      },
    });

    return jsonOk({
      applied: true,
      hiddenCount: matched.toHide.length,
      ...matched,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

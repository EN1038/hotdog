import { NextRequest } from "next/server";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { logAdminActivity } from "@/lib/admin-activity";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

async function getOwnedItem(branchId: string, itemId: string) {
  return prisma.branchNonMenuItem.findFirst({
    where: { id: itemId, branchId },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id: branchId, itemId } = await params;
    const { session } = await requireBranchAccess(branchId);

    const existing = await getOwnedItem(branchId, itemId);
    if (!existing) return jsonError("ไม่พบรายการ", 404);

    const body = await req.json();
    const name =
      typeof body.name === "string" ? body.name.trim() : existing.name;
    const unit =
      typeof body.unit === "string" ? body.unit.trim() : existing.unit;
    const description =
      body.description === undefined
        ? existing.description
        : typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    const imageUrl =
      body.imageUrl === undefined
        ? existing.imageUrl
        : typeof body.imageUrl === "string"
          ? body.imageUrl.trim() || null
          : null;
    let price = existing.price;
    if (body.price !== undefined) {
      if (body.price === "" || body.price == null) {
        price = null;
      } else {
        const n = Number(body.price);
        if (!Number.isFinite(n) || n < 0) {
          return jsonError("ราคาไม่ถูกต้อง", 400);
        }
        price = n;
      }
    }

    if (!name || !unit) {
      return jsonError("กรุณาระบุชื่อและหน่วย", 400);
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, brandId: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const item = await prisma.branchNonMenuItem.update({
      where: { id: itemId },
      data: {
        name,
        unit,
        description,
        imageUrl,
        price,
      },
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `แก้ไขรายการ: ${item.name} ในสาขา ${branch.name}`,
      brandId: branch.brandId,
      branchId: branch.id,
      entityType: "BRANCH_NON_MENU_ITEM",
      entityId: item.id,
      entityName: item.name,
    });

    return jsonOk({ success: true, item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id: branchId, itemId } = await params;
    const { session } = await requireBranchAccess(branchId);

    const existing = await getOwnedItem(branchId, itemId);
    if (!existing) return jsonError("ไม่พบรายการ", 404);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, brandId: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    await prisma.branchNonMenuItem.delete({ where: { id: itemId } });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: `ลบรายการ: ${existing.name} ในสาขา ${branch.name}`,
      brandId: branch.brandId,
      branchId: branch.id,
      entityType: "BRANCH_NON_MENU_ITEM",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

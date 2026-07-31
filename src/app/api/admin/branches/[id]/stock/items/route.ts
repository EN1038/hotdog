import { NextRequest, NextResponse } from "next/server";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { logAdminActivity } from "@/lib/admin-activity";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { session } = await requireBranchAccess(id);

    const body = await req.json();
    const { name, description, unit, price, imageUrl, stockType } = body;

    if (!name || !unit || !stockType) {
      return jsonError("Missing required fields", 400);
    }

    const branch = await prisma.branch.findUnique({
      where: { id },
      select: { id: true, name: true, brandId: true },
    });
    if (!branch) {
      return jsonError("Branch not found", 404);
    }

    const item = await prisma.branchNonMenuItem.create({
      data: {
        branchId: branch.id,
        name,
        description,
        unit,
        price: price ? Number(price) : null,
        imageUrl,
        stockType,
        quantity: 0,
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
    console.error("Error creating branch non-menu item:", error);
    return handleApiError(error);
  }
}


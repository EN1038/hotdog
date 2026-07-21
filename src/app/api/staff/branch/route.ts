import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchServiceStatus,
  type BranchHoursFields,
} from "@/lib/branch-hours";

function staffCanToggleStore(roles: string[]) {
  return roles.includes("SELLER") || roles.includes("BOTH");
}

function branchStatusPayload(branch: BranchHoursFields) {
  const pickup = getBranchServiceStatus(branch, "PICKUP");
  const delivery = getBranchServiceStatus(branch, "DELIVERY");
  return {
    isOpen: branch.isOpen,
    pickup: {
      openNow: pickup.openNow,
      acceptingOrders: pickup.acceptingOrders,
      reason: pickup.reason,
    },
    delivery: {
      openNow: delivery.openNow,
      acceptingOrders: delivery.acceptingOrders,
      reason: delivery.reason,
    },
  };
}

const patchSchema = z.object({
  isOpen: z.boolean(),
});

export async function GET() {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        isOpen: true,
        allowAdvanceOrder: true,
        storefrontHours: true,
        deliveryHours: true,
        opensAt: true,
        closesAt: true,
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา");

    return jsonOk({
      ...branchStatusPayload(branch),
      canToggleStore: staffCanToggleStore(session.staffRoles),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireStaff();
    if (!staffCanToggleStore(session.staffRoles)) {
      return jsonError("เฉพาะพนักงานขายเท่านั้นที่เปิด/ปิดร้านได้", 403);
    }

    const body = patchSchema.parse(await request.json());
    const branch = await prisma.branch.update({
      where: { id: session.branchId },
      data: { isOpen: body.isOpen },
      select: {
        isOpen: true,
        allowAdvanceOrder: true,
        storefrontHours: true,
        deliveryHours: true,
        opensAt: true,
        closesAt: true,
      },
    });

    return jsonOk({
      ...branchStatusPayload(branch),
      canToggleStore: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

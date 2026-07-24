import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchServiceStatus,
  type BranchHoursFields,
} from "@/lib/branch-hours";
import {
  closeActiveShift,
  getActiveShift,
  openShift,
  serializeShift,
  ShiftGateError,
} from "@/lib/branch-shift";

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

const patchSchema = z
  .object({
    isOpen: z.boolean(),
    /** Required when opening a new round */
    openingCash: z.number().finite().min(0).max(1_000_000).optional(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((body, ctx) => {
    if (body.isOpen && body.openingCash == null) {
      ctx.addIssue({
        code: "custom",
        message: "กรุณากรอกตังทอนเมื่อเปิดร้าน",
        path: ["openingCash"],
      });
    }
  });

export async function GET() {
  try {
    const session = await requireStaff();
    const [branch, active] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: session.branchId },
        select: {
          isOpen: true,
          allowAdvanceOrder: true,
          storefrontHours: true,
          deliveryHours: true,
          opensAt: true,
          closesAt: true,
        },
      }),
      getActiveShift(session.branchId),
    ]);
    if (!branch) return jsonError("ไม่พบสาขา");

    return jsonOk({
      ...branchStatusPayload(branch),
      canToggleStore: staffCanToggleStore(session.staffRoles),
      canSell: Boolean(active),
      activeShift: active ? serializeShift(active) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH — open/close store via staff shift (opening requires openingCash). */
export async function PATCH(request: Request) {
  try {
    const session = await requireStaff();
    if (!staffCanToggleStore(session.staffRoles)) {
      return jsonError("เฉพาะพนักงานขายเท่านั้นที่เปิด/ปิดร้านได้", 403);
    }

    const body = patchSchema.parse(await request.json());

    try {
      if (body.isOpen) {
        await openShift({
          branchId: session.branchId,
          openingCash: body.openingCash!,
          note: body.note,
          openedByStaffId: session.staffId,
        });
      } else {
        await closeActiveShift({
          branchId: session.branchId,
          closedByStaffId: session.staffId,
        });
      }
    } catch (e) {
      if (e instanceof ShiftGateError) {
        return jsonError(e.message, e.status);
      }
      throw e;
    }

    const [branch, active] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: session.branchId },
        select: {
          isOpen: true,
          allowAdvanceOrder: true,
          storefrontHours: true,
          deliveryHours: true,
          opensAt: true,
          closesAt: true,
        },
      }),
      getActiveShift(session.branchId),
    ]);
    if (!branch) return jsonError("ไม่พบสาขา");

    return jsonOk({
      ...branchStatusPayload(branch),
      canToggleStore: true,
      canSell: Boolean(active),
      activeShift: active ? serializeShift(active) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import {
  menuItemOptionGroupInclude,
  flattenMenuItemOptionGroups,
} from "@/lib/menu-option-groups";
import {
  getPromoScheduleStatus,
  parsePromoScheduleInput,
  PROMO_EXPIRED_GRACE_DAYS,
  PROMO_SCHEDULE_STATUS_LABEL,
  serializePromoSchedule,
} from "@/lib/promo-schedule";
import { bangkokDateKey } from "@/lib/constants";

const patchSchema = z.object({
  promoStartsAt: z.string().trim().nullable().optional(),
  promoEndsAt: z.string().trim().nullable().optional(),
  promoContinuous: z.boolean().optional(),
  clearSchedule: z.boolean().optional(),
});

function isFromMenuPromo(item: {
  optionGroupLinks: Array<{ group: { mode: string } }>;
}) {
  return item.optionGroupLinks.some((l) => l.group.mode === "FROM_MENU");
}

/** GET — รายการโปรแพ็กของสาขา + สถานะวันหมดอายุ */
export async function GET() {
  try {
    const session = await requireStaff();
    const items = await prisma.branchMenuItem.findMany({
      where: {
        branchId: session.branchId,
        isHidden: false,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        category: { select: { id: true, name: true } },
        ...menuItemOptionGroupInclude,
      },
    });

    const now = new Date();
    const promos = items
      .filter(isFromMenuPromo)
      .map((item) => {
        const schedule = serializePromoSchedule(item);
        const status = getPromoScheduleStatus(schedule, now);
        return {
          id: item.id,
          name: item.name,
          price: Number(item.price),
          categoryName: item.category?.name ?? null,
          hideFromStaff: item.hideFromStaff,
          ...schedule,
          status,
          statusLabel: PROMO_SCHEDULE_STATUS_LABEL[status],
          endsAtDateKey: item.promoEndsAt
            ? bangkokDateKey(item.promoEndsAt)
            : null,
          startsAtDateKey: item.promoStartsAt
            ? bangkokDateKey(item.promoStartsAt)
            : null,
        };
      });

    return jsonOk({
      graceDays: PROMO_EXPIRED_GRACE_DAYS,
      promos,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH — กำหนดช่วงวันโปร (body.id + schedule) */
export async function PATCH(request: Request) {
  try {
    const session = await requireStaff();
    await assertBrandWriteAllowedByBranchId(session.branchId);

    const raw = await request.json();
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!id) return jsonError("กรุณาระบุโปร");

    const body = patchSchema.parse(raw);

    const existing = await prisma.branchMenuItem.findFirst({
      where: { id, branchId: session.branchId },
      include: menuItemOptionGroupInclude,
    });
    if (!existing) return jsonError("ไม่พบเมนู", 404);
    if (!isFromMenuPromo(existing)) {
      return jsonError("รายการนี้ไม่ใช่โปรเลือกไม้");
    }

    let schedule;
    try {
      schedule = parsePromoScheduleInput(body);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "ช่วงวันที่ไม่ถูกต้อง");
    }

    const updated = await prisma.branchMenuItem.update({
      where: { id: existing.id },
      data: {
        promoContinuous: schedule.promoContinuous,
        promoStartsAt: schedule.promoStartsAt,
        promoEndsAt: schedule.promoEndsAt,
      },
      include: menuItemOptionGroupInclude,
    });

    const serialized = serializePromoSchedule(updated);
    const status = getPromoScheduleStatus(serialized);

    return jsonOk({
      id: updated.id,
      name: updated.name,
      ...serialized,
      status,
      statusLabel: PROMO_SCHEDULE_STATUS_LABEL[status],
      endsAtDateKey: updated.promoEndsAt
        ? bangkokDateKey(updated.promoEndsAt)
        : null,
      startsAtDateKey: updated.promoStartsAt
        ? bangkokDateKey(updated.promoStartsAt)
        : null,
      item: flattenMenuItemOptionGroups(updated),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

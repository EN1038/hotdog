import { Prisma, PriceRange } from "@prisma/client";
import { z } from "zod";
import {
  assertBrandAccess,
  requireBranchAccess,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  isCancelledStatus,
  isRevenueStatus,
  orderGrandTotal,
} from "@/lib/order-totals";
import { weeklyScheduleSchema } from "@/lib/branch-hours";
import { PRICE_RANGE_IDS } from "@/lib/localized";
import { assertValidRestaurantCategories } from "@/lib/restaurant-type-access";
import {
  flattenMenuItemOptionGroups,
  menuItemOptionGroupInclude,
} from "@/lib/menu-option-groups";
import {
  attachBestsellerFlag,
  getBestsellerMenuItemIdsByBranch,
} from "@/lib/menu-bestsellers";
import {
  logAdminActivity,
  summarizeBranchPatch,
} from "@/lib/admin-activity";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  nameTh: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  code: z
    .string()
    .regex(/^[a-z0-9-]+$/, "รหัสใช้ตัวพิมพ์เล็ก a-z ตัวเลข และ - เท่านั้น")
    .nullable()
    .optional(),
  imageUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  primaryCategory: z.string().nullable().optional(),
  secondaryCategories: z.array(z.string()).max(2).optional(),
  priceRange: z.enum(PRICE_RANGE_IDS).nullable().optional(),
  ownerMessage: z.string().nullable().optional(),
  extraMessage: z.string().nullable().optional(),
  isOpen: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  allowAdvanceOrder: z.boolean().optional(),
  autoAcceptOrders: z.boolean().optional(),
  storefrontHours: weeklyScheduleSchema.optional(),
  deliveryHours: weeklyScheduleSchema.optional(),
});

type Params = { params: Promise<{ id: string }> };

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildLastDays(count: number) {
  const days: {
    date: string;
    label: string;
    revenue: number;
    cancelled: number;
  }[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      date: dayKey(d),
      label: d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
      revenue: 0,
      cancelled: 0,
    });
  }
  return days;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBranchAccess(id);
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        brand: true,
        staff: { include: { roles: true }, orderBy: { createdAt: "desc" } },
        menuItems: {
          include: {
            category: { select: { id: true, name: true, sortOrder: true } },
            ...menuItemOptionGroupInclude,
          },
          orderBy: [
            { isHidden: "asc" },
            { sortOrder: "asc" },
            { createdAt: "desc" },
          ],
        },
        menuCategories: {
          select: { id: true, name: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
        optionGroups: {
          include: {
            options: { orderBy: { createdAt: "asc" } },
            _count: { select: { menuItemLinks: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        deliveryLocations: { orderBy: { name: "asc" } },
        orders: {
          include: {
            customer: true,
            deliveryLocation: true,
            items: { include: { branchMenuItem: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const allOrders = await prisma.order.findMany({
      where: { branchId: id },
      select: {
        status: true,
        createdAt: true,
        deliveryFee: true,
        discountAmount: true,
        items: {
          select: { quantity: true, unitPrice: true, optionsPrice: true },
        },
      },
    });

    const last7 = buildLastDays(7);
    const byDay = new Map(last7.map((d) => [d.date, d]));

    let completedRevenue = 0;
    let cancelledRevenue = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let openCount = 0;

    for (const order of allOrders) {
      const total = orderGrandTotal(
        order.items.map((it) => ({
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          optionsPrice: Number(it.optionsPrice),
        })),
        Number(order.deliveryFee),
        Number(order.discountAmount),
      );
      const key = dayKey(order.createdAt);
      const bucket = byDay.get(key);

      if (isRevenueStatus(order.status)) {
        completedRevenue += total;
        completedCount += 1;
        if (bucket) bucket.revenue += total;
      } else if (isCancelledStatus(order.status)) {
        cancelledRevenue += total;
        cancelledCount += 1;
        if (bucket) bucket.cancelled += 1;
      } else {
        openCount += 1;
      }
    }

    const bestsellersByBranch = await getBestsellerMenuItemIdsByBranch([id]);
    const bestsellerIds = bestsellersByBranch.get(id);

    return jsonOk({
      ...branch,
      menuItems: attachBestsellerFlag(
        branch.menuItems.map(flattenMenuItemOptionGroups),
        bestsellerIds,
      ),
      orderStats: {
        completedRevenue,
        cancelledRevenue,
        completedCount,
        cancelledCount,
        openCount,
        totalOrders: allOrders.length,
        last7Days: last7,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireBranchAccess(id);
    const body = updateSchema.parse(await request.json());

    if (
      body.primaryCategory !== undefined ||
      body.secondaryCategories !== undefined
    ) {
      const existing = await prisma.branch.findUnique({
        where: { id },
        select: { primaryCategory: true, secondaryCategories: true },
      });
      const catError = await assertValidRestaurantCategories(
        body.primaryCategory !== undefined
          ? body.primaryCategory
          : existing?.primaryCategory,
        body.secondaryCategories !== undefined
          ? body.secondaryCategories
          : existing?.secondaryCategories,
      );
      if (catError) return jsonError(catError);
    }

    if (body.brandId !== undefined && body.brandId !== null) {
      const brand = await prisma.brand.findUnique({
        where: { id: body.brandId },
      });
      if (!brand) return jsonError("ไม่พบแบรนด์");
      await assertBrandAccess(session, body.brandId);
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.nameTh !== undefined && {
          nameTh: body.nameTh?.trim() || null,
        }),
        ...(body.nameEn !== undefined && {
          nameEn: body.nameEn?.trim() || null,
        }),
        ...(body.brandId !== undefined && { brandId: body.brandId }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        ...(body.phone !== undefined && {
          phone: body.phone ? normalizePhone(body.phone) : null,
        }),
        ...(body.primaryCategory !== undefined && {
          primaryCategory: body.primaryCategory,
        }),
        ...(body.secondaryCategories !== undefined && {
          secondaryCategories: body.secondaryCategories.slice(0, 2),
        }),
        ...(body.priceRange !== undefined && {
          priceRange: body.priceRange as PriceRange | null,
        }),
        ...(body.ownerMessage !== undefined && {
          ownerMessage: body.ownerMessage?.trim() || null,
        }),
        ...(body.extraMessage !== undefined && {
          extraMessage: body.extraMessage?.trim() || null,
        }),
        ...(body.isOpen !== undefined && { isOpen: body.isOpen }),
        ...(body.isHidden !== undefined && { isHidden: body.isHidden }),
        ...(body.allowAdvanceOrder !== undefined && {
          allowAdvanceOrder: body.allowAdvanceOrder,
        }),
        ...(body.autoAcceptOrders !== undefined && {
          autoAcceptOrders: body.autoAcceptOrders,
        }),
        ...(body.storefrontHours !== undefined && {
          storefrontHours:
            body.storefrontHours as unknown as Prisma.InputJsonValue,
          opensAt:
            body.storefrontHours.find((d) => d.dayOfWeek === 1)?.slots[0]
              ?.opensAt ?? null,
          closesAt:
            body.storefrontHours.find((d) => d.dayOfWeek === 1)?.slots[0]
              ?.closesAt ?? null,
        }),
        ...(body.deliveryHours !== undefined && {
          deliveryHours:
            body.deliveryHours as unknown as Prisma.InputJsonValue,
        }),
      },
      include: { brand: true },
    });

    await logAdminActivity(session, {
      action: "branch.update",
      summary: summarizeBranchPatch(
        body as Record<string, unknown>,
        branch.name,
      ),
      brandId: branch.brandId,
      brandName: branch.brand?.name ?? null,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      entityName: branch.name,
      metadata: {
        fields: Object.keys(body),
      },
    });

    return jsonOk(branch);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { session } = await requireBranchAccess(id);
    const existing = await prisma.branch.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        brandId: true,
        brand: { select: { name: true } },
      },
    });
    if (!existing) return jsonError("ไม่พบสาขา", 404);

    const orderCount = await prisma.order.count({ where: { branchId: id } });
    if (orderCount > 0) {
      return jsonError(
        "ลบสาขาไม่ได้ ยังมีออเดอร์ในระบบ — ใช้ “ซ่อนสาขา” แทนได้",
      );
    }

    await prisma.branch.delete({ where: { id } });

    await logAdminActivity(session, {
      action: "branch.delete",
      summary: `ลบสาขา ${existing.name}`,
      brandId: existing.brandId,
      brandName: existing.brand?.name ?? null,
      branchId: null,
      branchName: existing.name,
      entityType: "branch",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

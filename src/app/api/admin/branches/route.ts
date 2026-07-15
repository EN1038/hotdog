import { Prisma, PriceRange } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  assertBrandAccess,
  brandScopeWhere,
  ForbiddenError,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { slugifyCode, withUniqueSuffix } from "@/lib/slug";
import { normalizePhone } from "@/lib/constants";
import {
  defaultWeeklyHours,
  weeklyScheduleSchema,
} from "@/lib/branch-hours";
import { PRICE_RANGE_IDS } from "@/lib/localized";
import { assertValidRestaurantCategories } from "@/lib/restaurant-type-access";
import { logAdminActivity } from "@/lib/admin-activity";

const branchSchema = z.object({
  name: z.string().min(1),
  nameTh: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  code: z.string().min(1).nullable().optional(),
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
  allowAdvanceOrder: z.boolean().optional(),
  autoAcceptOrders: z.boolean().optional(),
  storefrontHours: weeklyScheduleSchema.optional(),
  deliveryHours: weeklyScheduleSchema.optional(),
});

async function resolveUniqueBranchCode(
  desired: string | null | undefined,
  name: string,
  brandId: string | null,
) {
  const base = slugifyCode(desired?.trim() || name) || "branch";
  const existing = await prisma.branch.findMany({
    where: brandId ? { brandId } : { brandId: null },
    select: { code: true },
  });
  const taken = new Set(
    existing.map((b) => b.code).filter((c): c is string => Boolean(c)),
  );
  return withUniqueSuffix(base, taken);
}

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const brandId = new URL(request.url).searchParams.get("brandId");

    if (brandId) {
      await assertBrandAccess(session, brandId);
    }

    const branches = await prisma.branch.findMany({
      where: {
        ...brandScopeWhere(session),
        ...(brandId ? { brandId } : {}),
      },
      include: {
        brand: true,
        _count: {
          select: {
            staff: true,
            menuItems: true,
            deliveryLocations: true,
            orders: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk(branches);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const body = branchSchema.parse(await request.json());
    const brandId = body.brandId ?? null;

    const catError = await assertValidRestaurantCategories(
      body.primaryCategory ?? null,
      body.secondaryCategories,
    );
    if (catError) return jsonError(catError);

    if (!session.isPlatformAdmin) {
      if (!brandId) {
        throw new ForbiddenError("ต้องเลือกแบรนด์ของสาขา");
      }
      await assertBrandAccess(session, brandId);
    } else if (brandId) {
      await assertBrandAccess(session, brandId);
    }

    const code = await resolveUniqueBranchCode(body.code, body.name, brandId);
    const storefrontHours = body.storefrontHours ?? defaultWeeklyHours();
    const deliveryHours = body.deliveryHours ?? defaultWeeklyHours();

    const branch = await prisma.branch.create({
      data: {
        name: body.name,
        nameTh: body.nameTh?.trim() || null,
        nameEn: body.nameEn?.trim() || null,
        brandId,
        code,
        imageUrl: body.imageUrl ?? null,
        address: body.address?.trim() || null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        phone: body.phone ? normalizePhone(body.phone) : null,
        primaryCategory: body.primaryCategory ?? null,
        secondaryCategories: body.secondaryCategories?.slice(0, 2) ?? [],
        priceRange: (body.priceRange as PriceRange | null) ?? null,
        ownerMessage: body.ownerMessage?.trim() || null,
        extraMessage: body.extraMessage?.trim() || null,
        isOpen: body.isOpen ?? true,
        allowAdvanceOrder: body.allowAdvanceOrder ?? true,
        autoAcceptOrders: body.autoAcceptOrders ?? false,
        storefrontHours: storefrontHours as unknown as Prisma.InputJsonValue,
        deliveryHours: deliveryHours as unknown as Prisma.InputJsonValue,
        opensAt:
          storefrontHours.find((d) => d.dayOfWeek === 1)?.slots[0]?.opensAt ??
          "10:00",
        closesAt:
          storefrontHours.find((d) => d.dayOfWeek === 1)?.slots[0]?.closesAt ??
          "22:00",
      },
      include: {
        brand: true,
        _count: {
          select: {
            staff: true,
            menuItems: true,
            deliveryLocations: true,
            orders: true,
          },
        },
      },
    });

    await logAdminActivity(session, {
      action: "branch.create",
      summary: `สร้างสาขา ${branch.name}`,
      brandId: branch.brandId,
      brandName: branch.brand?.name ?? null,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "branch",
      entityId: branch.id,
      entityName: branch.name,
    });

    return jsonOk(branch, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

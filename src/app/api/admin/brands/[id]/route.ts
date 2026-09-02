import { z } from "zod";
import {
  requireBrandAccess,
  requirePlatformAdmin,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { DEFAULT_BRAND_COLOR, parseHexColor } from "@/lib/color";
import { logAdminActivity } from "@/lib/admin-activity";
import { applyPlanPreset } from "@/lib/brand-plan";
import {
  BRAND_STATUS_LABELS,
  getBrandSubscriptionState,
} from "@/lib/brand-plan-shared";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  code: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(1).optional(),
  nameTh: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  siteTitle: z.string().nullable().optional(),
  siteDescription: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  color: z.string().optional(),
  queueTicketCopies: z.number().int().min(1).max(5).optional(),
  status: z.enum(["TRIAL", "ACTIVE", "PAUSED", "EXPIRED", "DELETED"]).optional(),
  plan: z.enum(["RETAIL", "WEIGH_TABLE", "MALA", "MULTI"]).optional(),
  applyPlanPreset: z.boolean().optional(),
  maxBranches: z.number().int().min(1).max(200).optional(),
  maxStaff: z.number().int().min(1).max(500).optional(),
  stockEnabled: z.boolean().optional(),
  kitchenEnabled: z.boolean().optional(),
  bbqEnabled: z.boolean().optional(),
  skewerEnabled: z.boolean().optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  serviceStartsAt: z.string().datetime().nullable().optional(),
  smsQuotaGranted: z.number().int().min(0).max(1_000_000).optional(),
  lineNotifyNewOrder: z.boolean().optional(),
  lineNotifySkewerOrder: z.boolean().optional(),
  lineNotifyDailySummary: z.boolean().optional(),
});

function normalizeColor(input: string) {
  const parsed = parseHexColor(input);
  return parsed?.hex ?? DEFAULT_BRAND_COLOR;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        branches: { orderBy: { name: "asc" } },
        _count: { select: { branches: true } },
      },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);
    const liveBranchCount = brand.branches.filter((b) => !b.isTest).length;
    const hasTestBranch = brand.branches.some((b) => b.isTest);
    const subscriptionState = getBrandSubscriptionState({
      status: brand.status,
      trialEndsAt: brand.trialEndsAt,
      nextDueAt: brand.nextDueAt,
    });
    return jsonOk({
      ...brand,
      hasTestBranch,
      subscriptionState: {
        ...subscriptionState,
        statusLabel: BRAND_STATUS_LABELS[brand.status] ?? brand.status,
        effectiveStatusLabel:
          BRAND_STATUS_LABELS[subscriptionState.effectiveStatus] ??
          subscriptionState.effectiveStatus,
      },
      _count: { ...brand._count, branches: liveBranchCount },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = patchSchema.parse(await request.json());

    const planFieldsTouched =
      body.status !== undefined ||
      body.plan !== undefined ||
      body.applyPlanPreset === true ||
      body.maxBranches !== undefined ||
      body.maxStaff !== undefined ||
      body.stockEnabled !== undefined ||
      body.kitchenEnabled !== undefined ||
      body.bbqEnabled !== undefined ||
      body.skewerEnabled !== undefined ||
      body.trialEndsAt !== undefined ||
      body.smsQuotaGranted !== undefined;

    if (planFieldsTouched && !session.isPlatformAdmin) {
      return jsonError("เฉพาะผู้ดูแลแพลตฟอร์มที่ตั้งแพ็กเกจ/สถานะแบรนด์ได้", 403);
    }

    if (body.code) {
      const dup = await prisma.brand.findFirst({
        where: { code: body.code, NOT: { id } },
      });
      if (dup) return jsonError("รหัสแบรนด์ซ้ำ");
    }

    const usePreset = Boolean(body.plan) && body.applyPlanPreset === true;
    const preset = usePreset && body.plan ? applyPlanPreset(body.plan) : null;

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(body.code !== undefined && { code: body.code }),
        ...(body.name !== undefined && { name: body.name }),
        ...(body.nameTh !== undefined && {
          nameTh: body.nameTh?.trim() || null,
        }),
        ...(body.nameEn !== undefined && {
          nameEn: body.nameEn?.trim() || null,
        }),
        ...(body.siteTitle !== undefined && {
          siteTitle: body.siteTitle?.trim() || null,
        }),
        ...(body.siteDescription !== undefined && {
          siteDescription: body.siteDescription?.trim() || null,
        }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        ...(body.coverImageUrl !== undefined && {
          coverImageUrl: body.coverImageUrl,
        }),
        ...(body.contactPhone !== undefined && {
          contactPhone: body.contactPhone?.replace(/\D/g, "").trim() || null,
        }),
        ...(body.color !== undefined && { color: normalizeColor(body.color) }),
        ...(body.queueTicketCopies !== undefined && {
          queueTicketCopies: body.queueTicketCopies,
        }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.plan !== undefined && { plan: body.plan }),
        ...(usePreset && preset
          ? {
              maxBranches: preset.maxBranches,
              maxStaff: preset.maxStaff,
              stockEnabled: preset.stockEnabled,
              kitchenEnabled: preset.kitchenEnabled,
              bbqEnabled: preset.bbqEnabled,
              skewerEnabled: preset.skewerEnabled,
            }
          : {}),
        ...(body.maxBranches !== undefined && {
          maxBranches: body.maxBranches,
        }),
        ...(body.maxStaff !== undefined && { maxStaff: body.maxStaff }),
        ...(body.stockEnabled !== undefined && {
          stockEnabled: body.stockEnabled,
        }),
        ...(body.kitchenEnabled !== undefined && {
          kitchenEnabled: body.kitchenEnabled,
        }),
        ...(body.bbqEnabled !== undefined && {
          bbqEnabled: body.bbqEnabled,
        }),
        ...(body.skewerEnabled !== undefined && {
          skewerEnabled: body.skewerEnabled,
        }),
        ...(body.trialEndsAt !== undefined && {
          trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null,
        }),
        ...(body.serviceStartsAt !== undefined && {
          serviceStartsAt: body.serviceStartsAt
            ? new Date(body.serviceStartsAt)
            : null,
        }),
        ...(body.smsQuotaGranted !== undefined && {
          smsQuotaGranted: body.smsQuotaGranted,
        }),
        ...(body.lineNotifyNewOrder !== undefined && {
          lineNotifyNewOrder: body.lineNotifyNewOrder,
        }),
        ...(body.lineNotifySkewerOrder !== undefined && {
          lineNotifySkewerOrder: body.lineNotifySkewerOrder,
        }),
        ...(body.lineNotifyDailySummary !== undefined && {
          lineNotifyDailySummary: body.lineNotifyDailySummary,
        }),
      },
    });

    await logAdminActivity(session, {
      action: "brand.update",
      summary: `แก้ไขแบรนด์ ${brand.name}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "brand",
      entityId: brand.id,
      entityName: brand.name,
      metadata: body,
    });

    return jsonOk(brand);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id } = await params;
    const existing = await prisma.brand.findUnique({
      where: { id },
      select: { id: true, name: true, code: true, status: true },
    });
    if (!existing) return jsonError("ไม่พบแบรนด์", 404);
    if (existing.status === "DELETED") {
      return jsonOk({ ok: true, alreadyDeleted: true });
    }

    await prisma.brand.update({
      where: { id },
      data: { status: "DELETED" },
    });

    await logAdminActivity(session, {
      action: "brand.soft_delete",
      summary: `ตั้งสถานะลบแบรนด์ ${existing.name} (/${existing.code})`,
      brandId: existing.id,
      brandName: existing.name,
      entityType: "brand",
      entityId: existing.id,
      entityName: existing.name,
      metadata: { code: existing.code, previousStatus: existing.status },
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

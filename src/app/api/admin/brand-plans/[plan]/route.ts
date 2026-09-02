import { z } from "zod";
import type { BrandPlan } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getBrandPlanCatalog } from "@/lib/brand-plan-catalog";
import { BRAND_PLANS_ORDERED } from "@/lib/brand-plan-shared";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  hint: z.string().trim().max(500).optional(),
  priceBaht: z.number().int().min(0).max(999_999).optional(),
  maxBranches: z.number().int().min(1).max(200).optional(),
  maxStaff: z.number().int().min(1).max(500).optional(),
  stockEnabled: z.boolean().optional(),
  kitchenEnabled: z.boolean().optional(),
  bbqEnabled: z.boolean().optional(),
  skewerEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(99).optional(),
});

function parsePlanParam(raw: string): BrandPlan | null {
  const plan = raw.toUpperCase();
  return BRAND_PLANS_ORDERED.includes(plan as BrandPlan)
    ? (plan as BrandPlan)
    : null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ plan: string }> },
) {
  try {
    await requirePlatformAdmin();

    const { plan: planParam } = await ctx.params;
    const plan = parsePlanParam(planParam);
    if (!plan) return jsonError("ไม่พบแพ็กเกจ", 404);

    const body = patchSchema.parse(await req.json());
    const existing = await prisma.brandPlanConfig.findUnique({ where: { plan } });
    if (!existing) return jsonError("ไม่พบแพ็กเกจ", 404);

    await prisma.brandPlanConfig.update({
      where: { plan },
      data: body,
    });

    const catalog = await getBrandPlanCatalog();
    return jsonOk(catalog);
  } catch (e) {
    return handleApiError(e);
  }
}

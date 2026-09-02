import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  ensureBrandPlanConfigs,
  getBrandPlanCatalog,
} from "@/lib/brand-plan-catalog";

export async function GET() {
  try {
    await requirePlatformAdmin();

    await ensureBrandPlanConfigs();
    const catalog = await getBrandPlanCatalog();
    const restaurantTypes = await prisma.restaurantType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        showInOwnerRegister: true,
        ownerRegisterPlan: true,
        ownerRegisterHint: true,
      },
    });

    return jsonOk({ ...catalog, restaurantTypes });
  } catch (e) {
    return handleApiError(e);
  }
}

const trialSchema = z.object({
  trialDays: z.number().int().min(1).max(90),
});

export async function PATCH(req: Request) {
  try {
    await requirePlatformAdmin();

    const body = trialSchema.parse(await req.json());
    await prisma.siteSettings.upsert({
      where: { id: "default" },
      update: { defaultTrialDays: body.trialDays },
      create: {
        id: "default",
        defaultTrialDays: body.trialDays,
      },
    });

    const catalog = await getBrandPlanCatalog();
    return jsonOk(catalog);
  } catch (e) {
    return handleApiError(e);
  }
}

import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { handleApiError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  getBrandPackageLabelLayout,
  updateBrandPackageLabelLayout,
} from "@/lib/print-layout/brand-package-label-layout";
import { packageLabelLayoutDocSchema } from "@/lib/print-layout/package-label-layout-schema";

type Params = { params: Promise<{ id: string }> };

const putSchema = z.object({
  layout: packageLabelLayoutDocSchema,
  bumpVersion: z.boolean().optional(),
});

/** GET — brand package-label layout for admin */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
    const payload = await getBrandPackageLabelLayout(id);
    return jsonOk(payload);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT — update brand package-label layout (auto bump version by default) */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await requireBrandAccess(id);
    const body = putSchema.parse(await request.json());
    const payload = await updateBrandPackageLabelLayout({
      brandId: id,
      layout: body.layout,
      bumpVersion: body.bumpVersion ?? true,
    });

    await logAdminActivity(session, {
      action: "brand.update",
      summary: `อัปเดตแบบป้ายรายการ v${payload.version}`,
      brandId: id,
      entityType: "BrandPrintLayout",
      entityId: id,
      metadata: { kind: "PACKAGE_LABEL", version: payload.version },
    });

    return jsonOk(payload);
  } catch (error) {
    return handleApiError(error);
  }
}

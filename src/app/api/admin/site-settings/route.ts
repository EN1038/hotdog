import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings, upsertSiteSettings } from "@/lib/site-settings";
import { handleApiError, jsonOk } from "@/lib/api";

const patchSchema = z.object({
  siteName: z.string().min(1).optional(),
  siteTitle: z.string().min(1).optional(),
  siteDescription: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
  primaryColor: z.string().min(4).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await getSiteSettings());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = patchSchema.parse(await request.json());
    const settings = await upsertSiteSettings(body);
    return jsonOk(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import {
  getPlatformSettings,
  upsertPlatformSettings,
} from "@/lib/platform-settings";
import { handleApiError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";

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
    await requirePlatformAdmin();
    return jsonOk(await getPlatformSettings());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = patchSchema.parse(await request.json());
    const settings = await upsertPlatformSettings(body);

    await logAdminActivity(session, {
      action: "site.update",
      summary: "อัปเดตตั้งค่าแพลตฟอร์ม",
      metadata: { fields: Object.keys(body) },
    });

    return jsonOk(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

import { requirePlatformAdmin } from "@/lib/admin-access";
import { handleApiError, jsonOk } from "@/lib/api";
import { getPlatformOpsDashboard } from "@/lib/platform-ops-metrics";
import { runPlatformOpsLineJobs } from "@/lib/line-platform-ops-notify";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import { z } from "zod";

export async function GET() {
  try {
    await requirePlatformAdmin();
    await ensureProdSchemaCompat().catch(() => null);
    return jsonOk(await getPlatformOpsDashboard());
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.object({
  runNotifyJobs: z.boolean().optional(),
});

/** Manual trigger for platform ops LINE jobs (platform admin). */
export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    await ensureProdSchemaCompat().catch(() => null);
    const body = postSchema.parse(await request.json().catch(() => ({})));
    if (body.runNotifyJobs) {
      const result = await runPlatformOpsLineJobs();
      return jsonOk({ ok: true, result });
    }
    return jsonOk(await getPlatformOpsDashboard());
  } catch (error) {
    return handleApiError(error);
  }
}

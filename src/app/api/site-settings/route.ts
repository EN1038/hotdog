import { getSiteSettings } from "@/lib/site-settings";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const settings = await getSiteSettings();
    return jsonOk(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

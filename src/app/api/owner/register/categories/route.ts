import { handleApiError, jsonOk } from "@/lib/api";
import { listOwnerRegisterCategories } from "@/lib/owner-register-category";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

/** Public list for owner self-register step — from admin-managed restaurant types. */
export async function GET() {
  try {
    await ensureProdSchemaCompat();
    const categories = await listOwnerRegisterCategories();
    return jsonOk({ categories });
  } catch (error) {
    return handleApiError(error);
  }
}

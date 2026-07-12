import { getSession } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  return jsonOk({ session });
}

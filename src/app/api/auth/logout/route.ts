import { clearSession, getSession } from "@/lib/auth";
import { jsonOk } from "@/lib/api";
import { revokeStaffAuthSessionByJti } from "@/lib/staff-auth-session";

export async function POST() {
  const session = await getSession();
  if (session?.type === "staff" && session.jti) {
    try {
      await revokeStaffAuthSessionByJti(session.jti);
    } catch (error) {
      console.error(
        "[auth/logout] revoke staff session",
        error instanceof Error ? error.message : error,
      );
    }
  }
  await clearSession();
  return jsonOk({ ok: true });
}

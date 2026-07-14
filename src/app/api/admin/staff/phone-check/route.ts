import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("phone") ?? "";
    const excludeId = searchParams.get("excludeId");
    const phone = normalizePhone(raw);

    if (phone.length < 9) {
      return jsonOk({
        phone,
        available: null,
        reason: "incomplete",
      });
    }

    const existing = await prisma.staff.findUnique({
      where: { phone },
      select: {
        id: true,
        name: true,
        branch: { select: { name: true } },
      },
    });

    if (!existing || (excludeId && existing.id === excludeId)) {
      return jsonOk({ phone, available: true });
    }

    return jsonOk({
      phone,
      available: false,
      staffId: existing.id,
      staffName: existing.name,
      branchName: existing.branch.name,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

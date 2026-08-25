import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  imageUrl: z.string().trim().max(2000).nullable().optional(),
});

/** GET — current staff profile (this branch + same phone). */
export async function GET() {
  try {
    const session = await requireStaff();
    const staff = await prisma.staff.findFirst({
      where: { id: session.staffId },
      select: { name: true, imageUrl: true, phone: true, phoneVerifiedAt: true },
    });
    if (!staff) return jsonError("ไม่พบพนักงาน", 404);
    return jsonOk({
      name: staff.name?.trim() || "",
      imageUrl: staff.imageUrl?.trim() || null,
      phone: staff.phone,
      phoneVerified: Boolean(staff.phoneVerifiedAt),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH — update name / photo for this phone across branches. */
export async function PATCH(request: Request) {
  try {
    const session = await requireStaff();
    const body = patchSchema.parse(await request.json());
    if (body.name === undefined && body.imageUrl === undefined) {
      return jsonError("ไม่มีข้อมูลให้อัปเดต");
    }

    const data: { name?: string | null; imageUrl?: string | null } = {};
    if (body.name !== undefined) data.name = body.name.trim() || null;
    if (body.imageUrl !== undefined) {
      data.imageUrl = body.imageUrl?.trim() || null;
    }

    await prisma.staff.updateMany({
      where: { phone: session.staffPhone, isActive: true },
      data,
    });

    const staff = await prisma.staff.findFirst({
      where: { id: session.staffId },
      select: { name: true, imageUrl: true, phone: true, phoneVerifiedAt: true },
    });
    return jsonOk({
      name: staff?.name?.trim() || "",
      imageUrl: staff?.imageUrl?.trim() || null,
      phone: staff?.phone ?? session.staffPhone,
      phoneVerified: Boolean(staff?.phoneVerifiedAt),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

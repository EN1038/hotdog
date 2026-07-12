import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StaffRole } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  phone: z.string().min(9),
  roles: z
    .array(z.nativeEnum(StaffRole))
    .min(1)
    .refine((roles) => new Set(roles).size === roles.length, "roles ซ้ำกัน"),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const staff = await prisma.staff.findMany({
      where: { branchId },
      include: { roles: true },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk(staff);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const body = createSchema.parse(await request.json());
    const phone = normalizePhone(body.phone);

    const staff = await prisma.staff.create({
      data: {
        branchId,
        phone,
        roles: {
          create: body.roles.map((role) => ({ role })),
        },
      },
      include: { roles: true },
    });
    return jsonOk(staff, 201);
  } catch (error) {
    return handleApiError(error);
  }
}


import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StaffRole } from "@prisma/client";
import {
  logAdminActivity,
} from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const genderSchema = z.enum(["male", "female", "other"]).nullable().optional();

const createSchema = z.object({
  phone: z.string().min(9),
  name: z.string().trim().nullable().optional(),
  gender: genderSchema,
  age: z.number().int().min(1).max(120).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  roles: z
    .array(z.nativeEnum(StaffRole))
    .min(1)
    .refine((roles) => new Set(roles).size === roles.length, "roles ซ้ำกัน"),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
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
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { brand: { select: { name: true } } },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const body = createSchema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 9) {
      return jsonError("เบอร์โทรไม่ถูกต้อง");
    }

    const duplicate = await prisma.staff.findUnique({ where: { phone } });
    if (duplicate) {
      return jsonError("เบอร์โทรนี้ถูกใช้ในระบบแล้ว", 409);
    }

    const name = body.name?.trim() ? body.name.trim() : null;

    const staff = await prisma.staff.create({

      data: {
        branchId,
        phone,
        name,
        gender: body.gender ?? null,
        age: body.age ?? null,
        imageUrl: body.imageUrl ?? null,
        roles: {
          create: body.roles.map((role) => ({ role })),
        },
      },
      include: { roles: true },
    });

    await logAdminActivity(session, {
      action: "staff.create",
      summary: `เพิ่มพนักงาน ${name || phone}`,
      brandId: branch.brandId,
      brandName: branch.brand?.name ?? null,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "staff",
      entityId: staff.id,
      entityName: name || phone,
      metadata: { phone, roles: body.roles },
    });

    return jsonOk(staff, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

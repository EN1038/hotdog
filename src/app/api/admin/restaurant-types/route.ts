import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { slugifyCode } from "@/lib/slug";
import { logAdminActivity } from "@/lib/admin-activity";

const createSchema = z.object({
  name: z.string().trim().min(1),
  code: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "1";

    if (!prisma.restaurantType) {
      return jsonError(
        "โมเดลประเภทร้านยังไม่พร้อม — กรุณารีสตาร์ทเซิร์ฟเวอร์หลัง prisma generate",
        503,
      );
    }

    const types = await prisma.restaurantType.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return jsonOk(types);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = createSchema.parse(await request.json());
    const code =
      body.code?.trim() ||
      slugifyCode(body.name).replace(/-/g, "_") ||
      "type";

    const existing = await prisma.restaurantType.findUnique({
      where: { code },
    });
    if (existing) return jsonError("รหัสประเภทซ้ำ");

    const maxSort = await prisma.restaurantType.aggregate({
      _max: { sortOrder: true },
    });

    const type = await prisma.restaurantType.create({
      data: {
        code,
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        isActive: body.isActive ?? true,
      },
    });

    await logAdminActivity(session, {
      action: "restaurant_type.create",
      summary: `เพิ่มประเภทร้าน ${type.name}`,
      entityType: "restaurant_type",
      entityId: type.id,
      entityName: type.name,
      metadata: { code: type.code },
    });

    return jsonOk(type, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { DEFAULT_BRAND_COLOR, parseHexColor } from "@/lib/color";

const brandSchema = z.object({
  code: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "ใช้ตัวพิมพ์เล็ก a-z ตัวเลข และ - เท่านั้น"),
  name: z.string().min(1),
  nameTh: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  color: z.string().optional(),
});

function normalizeColor(input: string | undefined) {
  const parsed = parseHexColor(input ?? DEFAULT_BRAND_COLOR);
  return parsed?.hex ?? DEFAULT_BRAND_COLOR;
}

export async function GET() {
  try {
    await requireAdmin();
    const brands = await prisma.brand.findMany({
      include: { _count: { select: { branches: true } } },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk(brands);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = brandSchema.parse(await request.json());
    const existing = await prisma.brand.findUnique({
      where: { code: body.code },
    });
    if (existing) return jsonError("รหัสแบรนด์ซ้ำ");

    const brand = await prisma.brand.create({
      data: {
        code: body.code,
        name: body.name,
        nameTh: body.nameTh?.trim() || null,
        nameEn: body.nameEn?.trim() || null,
        logoUrl: body.logoUrl ?? null,
        color: normalizeColor(body.color),
      },
    });
    return jsonOk(brand, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const brandSchema = z.object({
  code: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "ใช้ตัวพิมพ์เล็ก a-z ตัวเลข และ - เท่านั้น"),
  name: z.string().min(1),
  logoUrl: z.string().nullable().optional(),
});

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
        logoUrl: body.logoUrl ?? null,
      },
    });
    return jsonOk(brand, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

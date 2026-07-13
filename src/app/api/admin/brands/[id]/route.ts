import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  code: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(1).optional(),
  logoUrl: z.string().nullable().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        branches: { orderBy: { name: "asc" } },
        _count: { select: { branches: true } },
      },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);
    return jsonOk(brand);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    if (body.code) {
      const dup = await prisma.brand.findFirst({
        where: { code: body.code, NOT: { id } },
      });
      if (dup) return jsonError("รหัสแบรนด์ซ้ำ");
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(body.code !== undefined && { code: body.code }),
        ...(body.name !== undefined && { name: body.name }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
      },
    });
    return jsonOk(brand);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const count = await prisma.branch.count({ where: { brandId: id } });
    if (count > 0) {
      return jsonError("ลบแบรนด์ไม่ได้ ยังมีสาขาผูกอยู่");
    }
    await prisma.brand.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

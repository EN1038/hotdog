import { z } from "zod";
import {
  requireBrandAccess,
  requirePlatformAdmin,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { DEFAULT_BRAND_COLOR, parseHexColor } from "@/lib/color";
import { logAdminActivity } from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  code: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(1).optional(),
  nameTh: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  siteTitle: z.string().nullable().optional(),
  siteDescription: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  color: z.string().optional(),
});

function normalizeColor(input: string) {
  const parsed = parseHexColor(input);
  return parsed?.hex ?? DEFAULT_BRAND_COLOR;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireBrandAccess(id);
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
    const { id } = await params;
    const session = await requireBrandAccess(id);
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
        ...(body.nameTh !== undefined && {
          nameTh: body.nameTh?.trim() || null,
        }),
        ...(body.nameEn !== undefined && {
          nameEn: body.nameEn?.trim() || null,
        }),
        ...(body.siteTitle !== undefined && {
          siteTitle: body.siteTitle?.trim() || null,
        }),
        ...(body.siteDescription !== undefined && {
          siteDescription: body.siteDescription?.trim() || null,
        }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        ...(body.coverImageUrl !== undefined && {
          coverImageUrl: body.coverImageUrl,
        }),
        ...(body.contactPhone !== undefined && {
          contactPhone: body.contactPhone?.replace(/\D/g, "").trim() || null,
        }),
        ...(body.color !== undefined && { color: normalizeColor(body.color) }),
      },
    });

    await logAdminActivity(session, {
      action: "brand.update",
      summary: `แก้ไขแบรนด์ ${brand.name}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "brand",
      entityId: brand.id,
      entityName: brand.name,
      metadata: body,
    });

    return jsonOk(brand);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id } = await params;
    const existing = await prisma.brand.findUnique({
      where: { id },
      select: { id: true, name: true, code: true },
    });
    if (!existing) return jsonError("ไม่พบแบรนด์", 404);

    const count = await prisma.branch.count({ where: { brandId: id } });
    if (count > 0) {
      return jsonError("ลบแบรนด์ไม่ได้ ยังมีสาขาผูกอยู่");
    }
    await prisma.brand.delete({ where: { id } });

    await logAdminActivity(session, {
      action: "brand.delete",
      summary: `ลบแบรนด์ ${existing.name} (/${existing.code})`,
      brandId: null,
      brandName: existing.name,
      entityType: "brand",
      entityId: existing.id,
      entityName: existing.name,
      metadata: { code: existing.code },
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

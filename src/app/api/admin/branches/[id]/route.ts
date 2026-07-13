import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  brandId: z.string().nullable().optional(),
  code: z.string().min(1).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isOpen: z.boolean().optional(),
  opensAt: z.string().nullable().optional(),
  closesAt: z.string().nullable().optional(),
  allowAdvanceOrder: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        brand: true,
        staff: { include: { roles: true }, orderBy: { createdAt: "desc" } },
        menuItems: {
          include: {
            optionGroups: {
              include: { options: { orderBy: { sortOrder: "asc" } } },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: [{ isHidden: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
        },
        deliveryLocations: { orderBy: { name: "asc" } },
        orders: {
          include: {
            customer: true,
            deliveryLocation: true,
            items: { include: { branchMenuItem: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    return jsonOk(branch);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());

    if (body.brandId !== undefined && body.brandId !== null) {
      const brand = await prisma.brand.findUnique({ where: { id: body.brandId } });
      if (!brand) return jsonError("ไม่พบแบรนด์");
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.brandId !== undefined && { brandId: body.brandId }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.phone !== undefined && {
          phone: body.phone ? normalizePhone(body.phone) : null,
        }),
        ...(body.isOpen !== undefined && { isOpen: body.isOpen }),
        ...(body.opensAt !== undefined && { opensAt: body.opensAt }),
        ...(body.closesAt !== undefined && { closesAt: body.closesAt }),
        ...(body.allowAdvanceOrder !== undefined && {
          allowAdvanceOrder: body.allowAdvanceOrder,
        }),
      },
      include: { brand: true },
    });
    return jsonOk(branch);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.branch.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

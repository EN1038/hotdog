import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const branchSchema = z.object({
  name: z.string().min(1),
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

const updateSchema = branchSchema.partial();

type Params = { params: Promise<{ id: string }> };

export async function GET() {
  try {
    await requireAdmin();
    const branches = await prisma.branch.findMany({
      include: {
        brand: true,
        _count: {
          select: {
            staff: true,
            menuItems: true,
            deliveryLocations: true,
            orders: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk(branches);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = branchSchema.parse(await request.json());
    const branch = await prisma.branch.create({
      data: {
        name: body.name,
        brandId: body.brandId ?? null,
        code: body.code ?? null,
        imageUrl: body.imageUrl ?? null,
        address: body.address ?? null,
        phone: body.phone ?? null,
        isOpen: body.isOpen ?? true,
        opensAt: body.opensAt ?? null,
        closesAt: body.closesAt ?? null,
        allowAdvanceOrder: body.allowAdvanceOrder ?? true,
      },
      include: { brand: true },
    });
    return jsonOk(branch, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

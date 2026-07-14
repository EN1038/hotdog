import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { branchOptionGroupInclude } from "@/lib/menu-option-groups";

type Params = { params: Promise<{ id: string }> };

const optionSchema = z.object({
  name: z.string().trim().min(1),
  priceDelta: z.number().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  required: z.boolean().optional(),
  maxSelect: z.number().int().min(1).optional(),
  options: z.array(optionSchema).optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const groups = await prisma.branchOptionGroup.findMany({
      where: { branchId },
      include: branchOptionGroupInclude,
      orderBy: { createdAt: "asc" },
    });
    return jsonOk(groups);
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
    const group = await prisma.branchOptionGroup.create({
      data: {
        branchId,
        name: body.name,
        required: body.required ?? false,
        maxSelect: body.maxSelect ?? 1,
        ...(body.options?.length
          ? {
              options: {
                create: body.options.map((o) => ({
                  name: o.name,
                  priceDelta: o.priceDelta ?? 0,
                })),
              },
            }
          : {}),
      },
      include: branchOptionGroupInclude,
    });
    return jsonOk(group, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

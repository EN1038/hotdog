import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";

const branchSchema = z.object({
  name: z.string().min(1),
});

export async function GET() {
  try {
    await requireAdmin();
    const branches = await prisma.branch.findMany({
      include: {
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
      },
    });
    return jsonOk(branch, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const locationSchema = z.object({
  name: z.string().min(1),
});

const patchSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const body = locationSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const location = await prisma.deliveryLocation.create({
      data: { branchId, name: body.name },
    });
    return jsonOk(location, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const body = patchSchema.parse(await request.json());

    const location = await prisma.deliveryLocation.update({
      where: { id: body.locationId, branchId },
      data: { name: body.name },
    });
    return jsonOk(location);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id: branchId } = await params;
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");
    if (!locationId) return jsonError("ต้องระบุ locationId");

    await prisma.deliveryLocation.delete({
      where: { id: locationId, branchId },
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

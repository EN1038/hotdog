import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

const feeSchema = z.coerce.number().min(0).max(99999);

const coordSchema = z
  .union([z.number().finite(), z.null()])
  .optional();

const addressSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  });

const locationSchema = z.object({
  name: z.string().trim().min(1),
  deliveryFee: feeSchema.optional(),
  isCustomAddress: z.boolean().optional(),
  address: addressSchema,
  latitude: coordSchema,
  longitude: coordSchema,
});

const patchSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().trim().min(1),
  deliveryFee: feeSchema.optional(),
  isCustomAddress: z.boolean().optional(),
  address: addressSchema,
  latitude: coordSchema,
  longitude: coordSchema,
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = locationSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const location = await prisma.deliveryLocation.create({
      data: {
        branchId,
        name: body.name,
        deliveryFee: body.deliveryFee ?? 0,
        isCustomAddress: body.isCustomAddress ?? false,
        address: body.address ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
      },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "location.create",
      summary: `เพิ่มพื้นที่ส่ง ${location.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "location",
      entityId: location.id,
      entityName: location.name,
    });

    return jsonOk(location, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.deliveryLocation.findFirst({
      where: { id: body.locationId, branchId },
    });
    if (!existing) return jsonError("ไม่พบพื้นที่จัดส่ง", 404);

    const location = await prisma.deliveryLocation.update({
      where: { id: body.locationId },
      data: {
        name: body.name,
        ...(body.deliveryFee !== undefined
          ? { deliveryFee: body.deliveryFee }
          : {}),
        ...(body.isCustomAddress !== undefined
          ? { isCustomAddress: body.isCustomAddress }
          : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
        ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
      },
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "location.update",
      summary: `แก้ไขพื้นที่ส่ง ${location.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "location",
      entityId: location.id,
      entityName: location.name,
    });

    return jsonOk(location);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");
    if (!locationId) return jsonError("ต้องระบุ locationId");

    const existing = await prisma.deliveryLocation.findFirst({
      where: { id: locationId, branchId },
    });
    if (!existing) return jsonError("ไม่พบพื้นที่จัดส่ง", 404);

    const ctx = await getBranchActivityContext(branchId);
    await prisma.deliveryLocation.delete({
      where: { id: locationId },
    });

    await logAdminActivity(session, {
      action: "location.delete",
      summary: `ลบพื้นที่ส่ง ${existing.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "location",
      entityId: existing.id,
      entityName: existing.name,
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

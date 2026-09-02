import { prisma } from "@/lib/db";
import { revokeStaffAuthSessionsForPhone } from "@/lib/staff-auth-session";

export type BrandHardDeleteResult = {
  brandId: string;
  brandCode: string;
  brandName: string;
  branchesRemoved: number;
  ordersRemoved: number;
  skewerOrdersRemoved: number;
};

export class BrandHardDeleteError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "HAS_ORDERS",
    readonly details?: { orderCount: number; skewerOrderCount: number },
  ) {
    super(message);
    this.name = "BrandHardDeleteError";
  }
}

/**
 * Permanently remove a brand and its branches (cascade).
 * Orders block deletion unless `deleteOrders: true`.
 */
export async function hardDeleteBrandWithCleanup(opts: {
  brandId: string;
  deleteOrders?: boolean;
  revokeStaffSessionsForPhone?: string;
}): Promise<BrandHardDeleteResult> {
  const brand = await prisma.brand.findUnique({
    where: { id: opts.brandId },
    select: {
      id: true,
      code: true,
      name: true,
      branches: { select: { id: true } },
    },
  });
  if (!brand) {
    throw new BrandHardDeleteError("ไม่พบแบรนด์", "NOT_FOUND");
  }

  const branchIds = brand.branches.map((b) => b.id);
  const [orderCount, skewerOrderCount] =
    branchIds.length === 0
      ? [0, 0]
      : await Promise.all([
          prisma.order.count({ where: { branchId: { in: branchIds } } }),
          prisma.skewerOrder.count({ where: { branchId: { in: branchIds } } }),
        ]);

  if ((orderCount > 0 || skewerOrderCount > 0) && !opts.deleteOrders) {
    throw new BrandHardDeleteError(
      `แบรนด์มีออเดอร์ ${orderCount} รายการ · เสียบ ${skewerOrderCount} รายการ — ใช้ soft delete หรือส่ง deleteOrders: true`,
      "HAS_ORDERS",
      { orderCount, skewerOrderCount },
    );
  }

  await prisma.$transaction(async (tx) => {
    if (opts.deleteOrders && branchIds.length > 0) {
      await tx.order.deleteMany({ where: { branchId: { in: branchIds } } });
      await tx.skewerOrder.deleteMany({
        where: { branchId: { in: branchIds } },
      });
    }
    await tx.brand.delete({ where: { id: brand.id } });
  });

  if (opts.revokeStaffSessionsForPhone) {
    await revokeStaffAuthSessionsForPhone(opts.revokeStaffSessionsForPhone).catch(
      () => null,
    );
  }

  return {
    brandId: brand.id,
    brandCode: brand.code,
    brandName: brand.name,
    branchesRemoved: branchIds.length,
    ordersRemoved: opts.deleteOrders ? orderCount : 0,
    skewerOrdersRemoved: opts.deleteOrders ? skewerOrderCount : 0,
  };
}

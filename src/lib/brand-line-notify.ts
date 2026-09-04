import { prisma } from "@/lib/db";

/**
 * Brand-owner LINE order alerts removed — platform OA is backend-only now.
 * Kept as no-ops so older call sites / imports do not break.
 */
export async function notifyBrandOwnersNewOrder(
  _orderId: string,
): Promise<void> {
  return;
}

export async function notifyBrandOwnersSkewerOrder(
  _skewerOrderId: string,
): Promise<void> {
  return;
}

export async function isBrandLineDailySummaryEnabled(
  brandId: string,
): Promise<boolean> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { lineNotifyDailySummary: true },
  });
  return Boolean(brand?.lineNotifyDailySummary);
}

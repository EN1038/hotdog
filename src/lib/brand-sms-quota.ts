import type { SmsSendPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Billable owner-alert SMS purposes (count against brand quota). */
export const BRAND_SMS_QUOTA_PURPOSES: SmsSendPurpose[] = [
  "BRAND_ALERT_NEW_ORDER",
  "BRAND_ALERT_SKEWER_ORDER",
];

export type BrandSmsQuotaSnapshot = {
  granted: number;
  used: number;
  remaining: number;
};

export async function getBrandSmsQuota(
  brandId: string,
): Promise<BrandSmsQuotaSnapshot> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { smsQuotaGranted: true },
  });
  const granted = Math.max(0, brand?.smsQuotaGranted ?? 0);
  const used = await prisma.smsSendLog.count({
    where: {
      brandId,
      purpose: { in: BRAND_SMS_QUOTA_PURPOSES },
      status: "SENT",
    },
  });
  return {
    granted,
    used,
    remaining: Math.max(0, granted - used),
  };
}

export async function brandHasSmsQuota(brandId: string): Promise<boolean> {
  const q = await getBrandSmsQuota(brandId);
  return q.remaining > 0;
}

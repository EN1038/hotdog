import { prisma } from "@/lib/db";

/** เปิด/ปิดโมดูลสต็อกสาขาตามแพ็กเกจ — เปิดแล้วตั้งสาขาขายให้ stockEnabled อัตโนมัติ */
export async function syncBrandStockModule(
  brandId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) {
    await prisma.branch.updateMany({
      where: {
        brandId,
        kind: { not: "WAREHOUSE" },
      },
      data: { stockEnabled: false },
    });
    return;
  }

  await prisma.branch.updateMany({
    where: {
      brandId,
      kind: "STORE",
      isHidden: false,
    },
    data: { stockEnabled: true },
  });
}

import { prisma } from "@/lib/db";
import type { PublicStockLabel } from "@/lib/stock-label-public-format";

export type { PublicStockLabel } from "@/lib/stock-label-public-format";
export {
  formatPackageLabelDate,
  STOCK_LABEL_STATUS_LABEL,
} from "@/lib/stock-label-public-format";

export async function loadPublicStockLabel(
  id: string,
): Promise<PublicStockLabel | null> {
  const label = await prisma.stockLabel.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true } },
    },
  });
  if (!label) return null;

  return {
    id: label.id,
    labelCode: label.labelCode,
    lotNumber: label.lotNumber,
    productName: label.productName,
    productCode: label.productCode,
    brandName: label.brandName,
    branchName: label.branch.name,
    sourceBranchName: label.sourceBranchName,
    quantity: label.quantity,
    unit: label.unit,
    status: label.status,
    producedAt: label.producedAt?.toISOString() ?? null,
    expiresAt: label.expiresAt?.toISOString() ?? null,
    receivedAt: label.createdAt.toISOString(),
    documentNo: label.documentNo,
  };
}

import { prisma } from "@/lib/db";

export type PublicStockLabel = {
  id: string;
  labelCode: string;
  lotNumber: string;
  productName: string;
  productCode: string;
  brandName: string | null;
  branchName: string | null;
  sourceBranchName: string | null;
  quantity: number;
  unit: string;
  status: "ACTIVE" | "CONSUMED" | "VOID";
  producedAt: string | null;
  expiresAt: string | null;
  receivedAt: string | null;
  documentNo: string | null;
};

export const STOCK_LABEL_STATUS_LABEL: Record<PublicStockLabel["status"], string> =
  {
    ACTIVE: "พร้อมใช้งาน",
    CONSUMED: "จ่ายออกแล้ว",
    VOID: "ยกเลิกแล้ว",
  };

export function formatPackageLabelDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

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

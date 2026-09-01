import { prisma } from "@/lib/db";
import { barcodeDigitsOnly } from "@/lib/stock-barcode-format";
import {
  parseStockLabelQrPayload,
  stockLabelQrPayload,
} from "@/lib/stock-label-qr";

export async function resolveBrandStockLabel(input: {
  brandId: string;
  qrPayload?: string | null;
  labelCode?: string | null;
  labelId?: string | null;
}) {
  const fromQr = input.qrPayload
    ? parseStockLabelQrPayload(input.qrPayload)
    : null;

  if (input.labelId?.trim()) {
    return prisma.stockLabel.findFirst({
      where: {
        id: input.labelId.trim(),
        branch: { brandId: input.brandId },
      },
      include: {
        branch: { select: { id: true, name: true, kind: true } },
        receivedBranch: { select: { id: true, name: true } },
      },
    });
  }

  if (fromQr?.id) {
    return prisma.stockLabel.findFirst({
      where: {
        id: fromQr.id,
        branch: { brandId: input.brandId },
        ...(fromQr.labelCode ? { labelCode: fromQr.labelCode } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, kind: true } },
        receivedBranch: { select: { id: true, name: true } },
      },
    });
  }

  const code =
    barcodeDigitsOnly(input.labelCode ?? "") ||
    input.labelCode?.trim() ||
    fromQr?.labelCode;
  if (!code) return null;

  return prisma.stockLabel.findFirst({
    where: {
      labelCode: code,
      branch: { brandId: input.brandId },
    },
    orderBy: { createdAt: "desc" },
    include: {
      branch: { select: { id: true, name: true, kind: true } },
      receivedBranch: { select: { id: true, name: true } },
    },
  });
}

export function labelPreviewPayload(label: {
  id: string;
  labelCode: string;
  lotNumber: string;
  productName: string;
  productCode: string;
  brandName: string | null;
  sourceBranchName: string | null;
  quantity: number;
  unit: string;
  status: string;
  producedAt: Date | null;
  expiresAt: Date | null;
  documentNo: string | null;
  branch: { id: string; name: string; kind: string };
  receivedBranch?: { id: string; name: string } | null;
}) {
  return {
    id: label.id,
    labelCode: label.labelCode,
    lotNumber: label.lotNumber,
    productName: label.productName,
    productCode: label.productCode,
    brandName: label.brandName,
    sourceBranchName: label.sourceBranchName,
    originBranchName: label.branch.name,
    quantity: label.quantity,
    unit: label.unit,
    status: label.status,
    producedAt: label.producedAt?.toISOString() ?? null,
    expiresAt: label.expiresAt?.toISOString() ?? null,
    documentNo: label.documentNo,
    receivedBranchName: label.receivedBranch?.name ?? null,
    qrPayload: stockLabelQrPayload({
      id: label.id,
      labelCode: label.labelCode,
    }),
  };
}

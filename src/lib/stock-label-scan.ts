import {
  isStockLabelQrPayload,
  parseStockLabelQrPayload,
} from "@/lib/stock-label-qr";
import { isStockMenuQrPayload } from "@/lib/stock-menu-qr";
import { barcodeDigitsOnly } from "@/lib/stock-barcode-format";

export type StockLabelScanPreview = {
  id: string;
  labelCode: string;
  lotNumber: string;
  productName: string;
  productCode: string;
  brandName: string | null;
  sourceBranchName: string | null;
  originBranchName: string;
  quantity: number;
  unit: string;
  status: string;
  producedAt: string | null;
  expiresAt: string | null;
  documentNo: string | null;
  qrPayload: string;
  receivedBranchName?: string | null;
};

export function buildPackageLabelLookupQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isStockMenuQrPayload(trimmed)) return null;
  if (isStockLabelQrPayload(trimmed)) {
    return `qr=${encodeURIComponent(trimmed)}`;
  }
  const code = barcodeDigitsOnly(trimmed) || trimmed;
  return `labelCode=${encodeURIComponent(code)}`;
}

export async function fetchPackageLabelPreview(
  path: "package-receive" | "package-out",
  raw: string,
): Promise<StockLabelScanPreview> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("กรุณากรอกรหัสป้ายหรือสแกน QR");
  }
  if (isStockMenuQrPayload(trimmed)) {
    throw new Error("นี่คือ QR ป้ายเมนู — ใช้เมนูรับเข้าแพ็ก (ผลิต/แพ็ก)");
  }

  const query = buildPackageLabelLookupQuery(trimmed);
  if (!query) {
    throw new Error("กรุณากรอกรหัสป้ายหรือสแกน QR");
  }

  const res = await fetch(`/api/staff/stock/${path}?${query}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "ไม่พบป้ายแพ็ก",
    );
  }
  return body as StockLabelScanPreview;
}

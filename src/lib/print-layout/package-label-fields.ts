import { barcodeDigitsOnly } from "@/lib/stock-barcode-format";
import type { PackageLabelFieldMap } from "@/lib/print-layout/package-label-layout-types";

export type PackageLabelRenderInput = {
  labelCode: string;
  qrPayload: string;
  productName: string;
  productCode: string;
  brandName?: string | null;
  sourceBranchName?: string | null;
  quantity: number;
  unit: string;
  producedAtLabel?: string | null;
  lotNumber: string;
};

export function buildPackageLabelFieldMap(
  label: PackageLabelRenderInput,
): PackageLabelFieldMap {
  const productCode = barcodeDigitsOnly(label.productCode.trim()) || "—";
  const unit = label.unit.trim() || "ชิ้น";
  const labelCodeDigits = barcodeDigitsOnly(label.labelCode.trim()) || "—";
  const barcodeValue = labelCodeDigits === "—" ? "0" : labelCodeDigits;
  return {
    labelCode: label.labelCode.trim() || "—",
    qrPayload: label.qrPayload.trim() || label.labelCode.trim(),
    productName: label.productName.trim() || "—",
    productCode,
    brandName: label.brandName?.trim() || "SKILL SALE",
    sourceBranchName: label.sourceBranchName?.trim() || "",
    quantity: label.quantity,
    unit,
    producedAtLabel: label.producedAtLabel?.trim() || "—",
    lotNumber: label.lotNumber.trim() || "—",
    barcodeValue,
  };
}

export function applyTemplate(
  template: string,
  fields: PackageLabelFieldMap,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = fields[key];
    if (value == null) return "";
    return String(value);
  });
}

export function fieldText(
  field: string,
  fields: PackageLabelFieldMap,
  fallback = "—",
): string {
  const value = fields[field];
  if (value == null || String(value).trim() === "") return fallback;
  return String(value);
}

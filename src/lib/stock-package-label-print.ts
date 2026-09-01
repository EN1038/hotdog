import QRCode from "qrcode";
import { renderProductBarcodeSvg } from "@/lib/product-label-print";
import { barcodeDigitsOnly } from "@/lib/stock-barcode-format";
import {
  hasPackageLabelPrintBridge,
  hasPrintBridge,
  isPrinterConfigured,
  printPackageLabels,
  shouldUseBrowserPackageLabelPrint,
} from "@/lib/print-bridge";
import { stockLabelQrPayload } from "@/lib/stock-label-qr";

export type PackageLabelInput = {
  labelCode: string;
  qrPayload: string;
  productName: string;
  productCode: string;
  brandName?: string | null;
  sourceBranchName?: string | null;
  quantity: number;
  unit: string;
  producedAt?: string | null;
  lotNumber: string;
  copies?: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPackageProducedDate(iso: string | null | undefined): string {
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

function labelHtml(label: PackageLabelInput, qrSvg: string): string {
  const name = escapeHtml(label.productName.trim() || "—");
  const brand = escapeHtml(label.brandName?.trim() || "SKILL SALE");
  const productCode = escapeHtml(
    barcodeDigitsOnly(label.productCode.trim()) || "—",
  );
  const unit = escapeHtml(label.unit.trim() || "ชิ้น");
  const produced = formatPackageProducedDate(label.producedAt);
  const lot = escapeHtml(label.lotNumber.trim() || "—");
  const labelCode = escapeHtml(label.labelCode.trim() || "—");
  const barcodeValue = barcodeDigitsOnly(label.productCode.trim());
  const barcode = renderProductBarcodeSvg(barcodeValue || "0");

  return `
    <article class="label">
      <p class="brand">${brand}</p>
      <p class="name">${name}</p>
      <p class="row">รหัสสินค้า: ${productCode}</p>
      <p class="row">จำนวน: ${label.quantity} ${unit}</p>
      <p class="row">วันที่ผลิต: ${produced}</p>
      <p class="row">Lot: ${lot}</p>
      <p class="row">รหัสป้าย: ${labelCode}</p>
      <div class="barcode-wrap">
        <div class="barcode">${barcode}</div>
        <p class="barcode-text">${productCode}</p>
      </div>
      <div class="qr">${qrSvg}</div>
    </article>
  `;
}

function toNativePayload(label: PackageLabelInput) {
  return {
    labelCode: label.labelCode,
    qrPayload: label.qrPayload,
    productName: label.productName,
    productCode: label.productCode,
    brandName: label.brandName ?? "",
    sourceBranchName: label.sourceBranchName ?? "",
    quantity: label.quantity,
    unit: label.unit,
    producedAtLabel: formatPackageProducedDate(label.producedAt),
    lotNumber: label.lotNumber,
    copies: label.copies ?? 1,
  };
}

/** Print via APK when available, otherwise browser print dialog. */
export async function openPackageLabelPrint(
  labels: PackageLabelInput[],
): Promise<void> {
  if (typeof window === "undefined") return;

  const items = labels
    .map((label) => ({
      ...label,
      labelCode: label.labelCode.trim(),
      copies: Math.max(1, Math.min(99, label.copies ?? 1)),
    }))
    .filter((label) => label.labelCode.length > 0);

  if (items.length === 0) {
    window.alert("ไม่มีป้ายสำหรับพิมพ์");
    return;
  }

  // Inside SkillSale Print APK: always use Bluetooth bridge (WebView blocks popups).
  if (hasPrintBridge()) {
    if (!isPrinterConfigured()) {
      window.alert(
        "ยังไม่ได้เชื่อมเครื่องพิมพ์ — แตะสถานะเครื่องพิมพ์ด้านบนเพื่อเลือก Bluetooth",
      );
      return;
    }
    if (!hasPackageLabelPrintBridge()) {
      window.alert(
        "แอปเวอร์ชันเก่า — กรุณาติดตั้ง SkillSale Print v1.2.0 ขึ้นไป",
      );
      return;
    }
    const result = printPackageLabels(items.map(toNativePayload));
    if (result?.code === "1") return;
    window.alert(result?.message ?? "พิมพ์ป้ายแพ็กไม่สำเร็จ");
    return;
  }

  if (!shouldUseBrowserPackageLabelPrint()) return;

  await openPackageLabelPrintInBrowser(items);
}

async function openPackageLabelPrintInBrowser(
  items: PackageLabelInput[],
): Promise<void> {

  const qrSvgs = await Promise.all(
    items.map((label) =>
      QRCode.toString(label.qrPayload, {
        type: "svg",
        margin: 0,
        width: 120,
        errorCorrectionLevel: "M",
      }),
    ),
  );

  const printWindow = window.open(
    "",
    "_blank",
    "noopener,noreferrer,width=720,height=900",
  );
  if (!printWindow) {
    window.alert("เปิดหน้าพิมพ์ไม่ได้ — กรุณาอนุญาต popup");
    return;
  }

  const body = items
    .flatMap((label, i) =>
      Array.from({ length: label.copies ?? 1 }, () =>
        labelHtml(label, qrSvgs[i] ?? ""),
      ),
    )
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>พิมพ์ป้ายแพ็ก</title>
  <style>
    @page { size: 60mm 50mm; margin: 1mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #111;
    }
    .sheet {
      display: flex;
      flex-wrap: wrap;
      gap: 4mm;
      padding: 4mm;
    }
    .label {
      width: 56mm;
      min-height: 46mm;
      padding: 1.5mm 2.5mm 2mm;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .brand {
      margin: 0 0 1.5mm;
      font-size: 7pt;
      font-weight: 800;
      text-align: center;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .name {
      margin: 0 0 1.5mm;
      font-size: 8pt;
      font-weight: 800;
      line-height: 1.2;
    }
    .row {
      margin: 0 0 0.8mm;
      font-size: 6.5pt;
      line-height: 1.25;
    }
    .barcode-wrap {
      margin-top: 1.5mm;
      text-align: center;
    }
    .barcode { width: 100%; }
    .barcode svg { width: 100%; height: auto; }
    .barcode-text {
      margin: 0.5mm 0 0;
      font-size: 6pt;
      text-align: center;
    }
    .qr {
      margin-top: 1mm;
      text-align: center;
    }
    .qr svg { width: 22mm; height: 22mm; }
    @media print {
      .sheet { gap: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">${body}</div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`);
  printWindow.document.close();
}

/** Convert DB label rows to print inputs */
export function labelsToPrintInput(
  rows: Array<{
    id: string;
    labelCode: string;
    productName: string;
    productCode: string;
    brandName: string | null;
    sourceBranchName: string | null;
    quantity: number;
    unit: string;
    producedAt: Date | null;
    lotNumber: string;
  }>,
): PackageLabelInput[] {
  return rows.map((row) => ({
    labelCode: row.labelCode,
    qrPayload: stockLabelQrPayload({
      id: row.id,
      labelCode: row.labelCode,
    }),
    productName: row.productName,
    productCode: row.productCode,
    brandName: row.brandName,
    sourceBranchName: row.sourceBranchName,
    quantity: row.quantity,
    unit: row.unit,
    producedAt: row.producedAt?.toISOString() ?? null,
    lotNumber: row.lotNumber,
    copies: 1,
  }));
}

import QRCode from "qrcode";
import { renderProductBarcodeSvg } from "@/lib/product-label-print";

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

function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
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
  const brand = label.brandName?.trim();
  const source = label.sourceBranchName?.trim();
  const barcode = renderProductBarcodeSvg(label.labelCode);

  return `
    <article class="label">
      ${brand ? `<p class="brand">${escapeHtml(brand)}</p>` : ""}
      <p class="name">${name}</p>
      <p class="meta">SKU ${escapeHtml(label.productCode)} · ${label.quantity} ${escapeHtml(label.unit)}</p>
      <p class="meta">ผลิต ${formatThaiDate(label.producedAt)} · LOT ${escapeHtml(label.lotNumber)}</p>
      ${source ? `<p class="source">จาก ${escapeHtml(source)}</p>` : ""}
      <div class="codes">
        <div class="barcode">${barcode}</div>
        <div class="qr">${qrSvg}</div>
      </div>
    </article>
  `;
}

/** Open browser print dialog for package labels (barcode + QR). */
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

  const qrSvgs = await Promise.all(
    items.map((label) =>
      QRCode.toString(label.qrPayload, {
        type: "svg",
        margin: 0,
        width: 72,
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
      Array.from({ length: label.copies }, () =>
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
    @page { size: 60mm 40mm; margin: 2mm; }
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
      min-height: 36mm;
      border: 0.2mm dashed #ccc;
      padding: 2mm;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .brand {
      margin: 0 0 0.5mm;
      font-size: 6.5pt;
      font-weight: 700;
      color: #333;
      line-height: 1.2;
    }
    .name {
      margin: 0 0 0.5mm;
      font-size: 7.5pt;
      font-weight: 800;
      line-height: 1.15;
      max-height: 2.3em;
      overflow: hidden;
    }
    .meta, .source {
      margin: 0 0 0.5mm;
      font-size: 6pt;
      color: #444;
      line-height: 1.2;
    }
    .source { color: #666; }
    .codes {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 2mm;
      width: 100%;
      margin-top: 1mm;
    }
    .barcode { flex: 1; min-width: 0; }
    .barcode svg { width: 100%; height: auto; }
    .qr svg { width: 14mm; height: 14mm; }
    @media print {
      .sheet { gap: 0; padding: 0; }
      .label { border: none; }
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
    qrPayload: `hotdog:label:${row.id}:${row.labelCode}`,
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

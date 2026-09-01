import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { barcodeDigitsOnly } from "@/lib/stock-barcode-format";
import { stockMenuQrPayload } from "@/lib/stock-menu-qr";

export type ProductLabelInput = {
  code: string;
  name: string;
  itemId?: string | null;
  copies?: number;
  branchName?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render Code128 barcode as SVG markup (browser only). */
export function renderProductBarcodeSvg(code: string): string {
  if (typeof document === "undefined") {
    return "";
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, barcodeDigitsOnly(code) || code, {
    format: "CODE128",
    displayValue: true,
    fontSize: 13,
    height: 44,
    margin: 2,
    textMargin: 2,
  });
  return svg.outerHTML;
}

function labelHtml(label: ProductLabelInput, qrSvg: string): string {
  const code = barcodeDigitsOnly(label.code.trim()) || label.code.trim();
  const name = escapeHtml(label.name.trim() || "—");
  const branch = label.branchName?.trim();
  const barcode = renderProductBarcodeSvg(code);

  return `
    <article class="label">
      ${branch ? `<p class="branch">${escapeHtml(branch)}</p>` : ""}
      <p class="name">${name}</p>
      <div class="barcode">${barcode}</div>
      <p class="code">${escapeHtml(code)}</p>
      <div class="qr">${qrSvg}</div>
    </article>
  `;
}

/** Open browser print dialog for product barcode + QR labels. */
export async function openProductLabelPrint(
  labels: ProductLabelInput[],
): Promise<void> {
  if (typeof window === "undefined") return;
  const items = labels
    .map((label) => ({
      ...label,
      code: label.code.trim(),
      copies: Math.max(1, Math.min(99, label.copies ?? 1)),
    }))
    .filter((label) => label.code.length > 0);

  if (items.length === 0) {
    window.alert("ไม่มีรหัสสินค้าสำหรับพิมพ์");
    return;
  }

  const qrSvgs = await Promise.all(
    items.map((label) => {
      const payload = stockMenuQrPayload({
        itemId: label.itemId,
        productCode: label.code,
      });
      if (!payload) return "";
      return QRCode.toString(payload, {
        type: "svg",
        margin: 0,
        width: 96,
        errorCorrectionLevel: "M",
      });
    }),
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
    .flatMap((label, index) =>
      Array.from({ length: label.copies }, () =>
        labelHtml(label, qrSvgs[index] ?? ""),
      ),
    )
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>พิมพ์ป้ายสินค้า</title>
  <style>
    @page { size: 50mm 40mm; margin: 2mm; }
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
      width: 46mm;
      min-height: 34mm;
      border: 0.2mm dashed #ccc;
      padding: 2mm;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .branch {
      margin: 0 0 1mm;
      font-size: 7pt;
      color: #555;
      line-height: 1.2;
    }
    .name {
      margin: 0 0 1mm;
      font-size: 8pt;
      font-weight: 700;
      line-height: 1.2;
      max-height: 2.4em;
      overflow: hidden;
    }
    .barcode svg {
      width: 100%;
      height: auto;
    }
    .code {
      margin: 0.5mm 0 0;
      font-size: 7pt;
      font-weight: 700;
    }
    .qr svg {
      width: 18mm;
      height: 18mm;
      margin-top: 1mm;
    }
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

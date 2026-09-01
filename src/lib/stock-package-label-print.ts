import QRCode from "qrcode";
import {
  fetchPackageLabelLayoutForBrand,
  resolveStaffBrandId,
} from "@/lib/print-layout/package-label-layout-cache";
import { renderPackageLabelArticleFromLayout } from "@/lib/print-layout/package-label-layout-html";
import { DEFAULT_PACKAGE_LABEL_LAYOUT } from "@/lib/print-layout/package-label-default-layout";
import type { PackageLabelLayoutDoc } from "@/lib/print-layout/package-label-layout-types";
import {
  hasPackageLabelPrintBridge,
  hasPrintBridge,
  isPrinterConfigured,
  printPackageLabelsEnvelope,
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

async function resolvePrintLayout(brandId?: string | null): Promise<{
  brandId: string;
  version: number;
  layout: PackageLabelLayoutDoc;
}> {
  const resolvedBrandId = brandId?.trim() || (await resolveStaffBrandId());
  if (!resolvedBrandId) {
    return {
      brandId: "",
      version: DEFAULT_PACKAGE_LABEL_LAYOUT.version,
      layout: DEFAULT_PACKAGE_LABEL_LAYOUT,
    };
  }
  const cached = await fetchPackageLabelLayoutForBrand(resolvedBrandId);
  return {
    brandId: cached.brandId,
    version: cached.version,
    layout: cached.layout,
  };
}

/** Print via APK when available, otherwise browser print dialog. */
export async function openPackageLabelPrint(
  labels: PackageLabelInput[],
  brandId?: string | null,
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

  const layoutPayload = await resolvePrintLayout(brandId);

  if (hasPrintBridge()) {
    if (!isPrinterConfigured()) {
      window.alert(
        "ยังไม่ได้เชื่อมเครื่องพิมพ์ — แตะสถานะเครื่องพิมพ์ด้านบนเพื่อเลือก Bluetooth",
      );
      return;
    }
    if (!hasPackageLabelPrintBridge()) {
      window.alert(
        "แอปเวอร์ชันเก่า — กรุณาติดตั้ง SkillSale Print v1.2.9 ขึ้นไปเพื่อใช้แบบป้ายจากเว็บ",
      );
      return;
    }
    const result = printPackageLabelsEnvelope({
      brandId: layoutPayload.brandId,
      layoutVersion: layoutPayload.version,
      layout: layoutPayload.layout,
      labels: items.map(toNativePayload),
    });
    if (result?.code === "1") return;
    window.alert(result?.message ?? "พิมพ์ป้ายแพ็กไม่สำเร็จ");
    return;
  }

  if (!shouldUseBrowserPackageLabelPrint()) return;

  await openPackageLabelPrintInBrowser(items, layoutPayload.layout);
}

async function openPackageLabelPrintInBrowser(
  items: PackageLabelInput[],
  layout: PackageLabelLayoutDoc,
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
        renderPackageLabelArticleFromLayout(
          layout,
          {
            ...toNativePayload(label),
            producedAtLabel: formatPackageProducedDate(label.producedAt),
          },
          qrSvgs[i] ?? "",
        ),
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
      min-height: 46mm;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .barcode svg { width: 100%; height: auto; }
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

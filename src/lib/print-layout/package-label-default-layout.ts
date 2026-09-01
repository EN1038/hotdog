import type { PackageLabelLayoutDoc } from "@/lib/print-layout/package-label-layout-types";

/** Default package label layout — matches legacy APK/web design (v1). */
export const DEFAULT_PACKAGE_LABEL_LAYOUT: PackageLabelLayoutDoc = {
  version: 1,
  widthPx: 400,
  paddingH: 14,
  blocks: [
    {
      type: "text",
      field: "brandName",
      style: "header",
      align: "center",
      uppercase: true,
      fallback: "SKILL SALE",
    },
    {
      type: "text",
      field: "productName",
      style: "title",
      maxLines: 2,
    },
    {
      type: "text",
      template: "รหัสสินค้า: {{productCode}}",
      style: "row",
    },
    {
      type: "text",
      template: "จำนวน: {{quantity}} {{unit}}",
      style: "row",
    },
    {
      type: "text",
      template: "วันที่ผลิต: {{producedAtLabel}}",
      style: "row",
    },
    {
      type: "text",
      template: "Lot: {{lotNumber}}",
      style: "row",
    },
    {
      type: "text",
      template: "รหัสป้าย: {{labelCode}}",
      style: "row",
    },
    { type: "spacer", height: 6 },
    {
      type: "barcode",
      field: "labelCode",
      width: 260,
      height: 50,
      showCaption: true,
      captionField: "labelCode",
    },
    { type: "spacer", height: 10 },
    {
      type: "qr",
      field: "qrPayload",
      size: 140,
    },
  ],
};

export type PackageLabelFieldOption = {
  id: string;
  label: string;
  hint?: string;
};

export const PACKAGE_LABEL_FIELD_OPTIONS: PackageLabelFieldOption[] = [
  { id: "brandName", label: "ชื่อแบรนด์" },
  { id: "productName", label: "ชื่อสินค้า" },
  { id: "productCode", label: "รหัสสินค้า" },
  { id: "quantity", label: "จำนวน" },
  { id: "unit", label: "หน่วย" },
  { id: "producedAtLabel", label: "วันที่ผลิต" },
  { id: "lotNumber", label: "Lot" },
  { id: "labelCode", label: "รหัสป้าย" },
  { id: "sourceBranchName", label: "สาขาต้นทาง" },
  { id: "barcodeValue", label: "ค่าบาร์โค้ด (ตัวเลข)" },
  { id: "qrPayload", label: "ข้อมูล QR" },
];

export const PACKAGE_LABEL_TEXT_STYLES = [
  { id: "header", label: "หัว (ใหญ่)" },
  { id: "title", label: "ชื่อสินค้า" },
  { id: "row", label: "บรรทัดข้อมูล" },
  { id: "caption", label: "คำบรรยายเล็ก" },
] as const;

export const PACKAGE_LABEL_TEMPLATE_HINTS = [
  "รหัสสินค้า: {{productCode}}",
  "จำนวน: {{quantity}} {{unit}}",
  "วันที่ผลิต: {{producedAtLabel}}",
  "Lot: {{lotNumber}}",
  "รหัสป้าย: {{labelCode}}",
];

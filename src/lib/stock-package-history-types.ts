export const PACKAGE_HISTORY_KINDS = ["all", "in", "out"] as const;
export type PackageHistoryKind = (typeof PACKAGE_HISTORY_KINDS)[number];

export const PACKAGE_HISTORY_KIND_LABEL: Record<PackageHistoryKind, string> = {
  all: "ทั้งหมด",
  in: "รับเข้าแพ็ก",
  out: "จ่ายแพ็ก",
};

export function isPackageHistoryKind(v: string): v is PackageHistoryKind {
  return (PACKAGE_HISTORY_KINDS as readonly string[]).includes(v);
}

export type PackageHistoryLine = {
  id: string;
  labelId: string;
  labelCode: string;
  lotNumber: string;
  name: string;
  productCode: string;
  imageUrl: string | null;
  quantity: number;
  unit: string;
  status: string;
  qrPayload: string;
};

export type PackageHistoryBatch = {
  id: string;
  batchId: string;
  documentNo: string | null;
  label: string;
  kind: "in" | "out";
  createdAt: string;
  producedAt: string | null;
  brandName: string | null;
  sourceBranchName: string | null;
  createdByStaff: { id: string; name: string } | null;
  packageCount: number;
  totalQty: number;
  lines: PackageHistoryLine[];
};

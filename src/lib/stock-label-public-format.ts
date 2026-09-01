export type PublicStockLabel = {
  id: string;
  labelCode: string;
  lotNumber: string;
  productName: string;
  productCode: string;
  brandName: string | null;
  branchName: string | null;
  sourceBranchName: string | null;
  quantity: number;
  unit: string;
  status: "ACTIVE" | "CONSUMED" | "VOID";
  producedAt: string | null;
  expiresAt: string | null;
  receivedAt: string | null;
  documentNo: string | null;
};

export const STOCK_LABEL_STATUS_LABEL: Record<PublicStockLabel["status"], string> =
  {
    ACTIVE: "พร้อมใช้งาน",
    CONSUMED: "จ่ายออกแล้ว",
    VOID: "ยกเลิกแล้ว",
  };

export function formatPackageLabelDate(iso: string | null | undefined): string {
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

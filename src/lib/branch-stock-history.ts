import {
  BRANCH_STOCK_OUT_HISTORY_TYPES,
  BRANCH_WASTE_HISTORY_TYPES,
  outboundHistoryLabel,
} from "@/lib/stock-outbound";
import { parseBranchMenuOrderNote } from "@/lib/branch-menu-order-note";

export const BRANCH_HISTORY_KINDS = [
  "all",
  "in",
  "sale",
  "waste",
  "out",
] as const;

export type BranchHistoryKind = (typeof BRANCH_HISTORY_KINDS)[number];

export const BRANCH_HISTORY_KIND_LABEL: Record<BranchHistoryKind, string> = {
  all: "ทั้งหมด",
  in: "รับเข้า",
  sale: "ขาย",
  waste: "ของเสีย",
  out: "จ่ายออก",
};

export function isBranchHistoryKind(v: string): v is BranchHistoryKind {
  return (BRANCH_HISTORY_KINDS as readonly string[]).includes(v);
}

export function historyTypesForKind(kind: BranchHistoryKind): string[] {
  switch (kind) {
    case "in":
      return ["STOCK_IN"];
    case "sale":
      return ["SALE"];
    case "waste":
      return [...BRANCH_WASTE_HISTORY_TYPES];
    case "out":
      return [...BRANCH_STOCK_OUT_HISTORY_TYPES];
    case "all":
    default:
      return [
        "STOCK_IN",
        "SALE",
        ...BRANCH_WASTE_HISTORY_TYPES,
        ...BRANCH_STOCK_OUT_HISTORY_TYPES,
      ];
  }
}

export function branchHistoryKindOfType(type: string): Exclude<
  BranchHistoryKind,
  "all"
> {
  if (type === "STOCK_IN") return "in";
  if (type === "SALE") return "sale";
  if (type === "DAMAGE" || type === "LOST") return "waste";
  return "out";
}

export function branchHistoryLabel(type: string): string {
  if (type === "STOCK_IN") return "รับเข้า";
  if (type === "SALE") return "ขาย";
  return outboundHistoryLabel(type);
}

export type BranchHistoryFlatRow = {
  id: string;
  branchId: string;
  branchName?: string | null;
  type: string;
  quantity: number;
  note: string | null;
  imageUrl: string | null;
  batchId: string | null;
  documentNo: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelNote: string | null;
  stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  unit: string;
  name: string;
  createdByStaff: { id: string; name: string | null } | null;
  order: { id: string; orderNumber: string } | null;
};

export function fallbackBranchHistoryGroupKey(row: BranchHistoryFlatRow) {
  const minuteKey = new Date(row.createdAt);
  minuteKey.setSeconds(0, 0);
  return [
    "fb",
    row.type,
    row.createdByStaff?.id ?? "none",
    row.note ?? "",
    row.imageUrl ?? "",
    minuteKey.toISOString(),
  ].join("|");
}

/** ขาย = 1 ออเดอร์/เลขบิล · อื่นๆ = เลขเอกสาร หรือ batch */
export function branchHistoryGroupKey(row: BranchHistoryFlatRow): string {
  if (row.type === "SALE") {
    if (row.order?.id) return `order:${row.order.id}`;
    if (row.order?.orderNumber?.trim()) {
      return `orderno:${row.order.orderNumber.trim()}`;
    }
    return fallbackBranchHistoryGroupKey(row);
  }
  const doc = row.documentNo?.trim();
  if (doc) return `doc:${doc}`;
  const batch = row.batchId?.trim();
  if (batch) return `batch:${batch}`;
  return fallbackBranchHistoryGroupKey(row);
}

export function orderFromHistoryNote(note: string | null | undefined) {
  return parseBranchMenuOrderNote(note);
}

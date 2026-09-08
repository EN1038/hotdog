import { z } from "zod";
import { isBangkokDateKey } from "@/lib/constants";
import { expenseDateFromKey, expenseDateKey } from "@/lib/branch-expense";

/** Non-menu stock kinds usable as purchase masters. */
export const PURCHASE_STOCK_TYPES = [
  "CONSUMABLE",
  "RAW_MATERIAL",
  "EQUIPMENT",
  "OTHER",
] as const;

export type PurchaseStockType = (typeof PURCHASE_STOCK_TYPES)[number];

export const PURCHASE_STOCK_TYPE_LABEL: Record<PurchaseStockType, string> = {
  CONSUMABLE: "สิ้นเปลือง",
  RAW_MATERIAL: "วัตถุดิบ",
  EQUIPMENT: "อุปกรณ์",
  OTHER: "อื่น ๆ",
};

export const NON_MENU_STOCK_TYPES = PURCHASE_STOCK_TYPES;

export function isPurchaseStockType(v: string): v is PurchaseStockType {
  return (PURCHASE_STOCK_TYPES as readonly string[]).includes(v);
}

export function purchaseStockTypeLabel(stockType: string): string {
  if (isPurchaseStockType(stockType)) return PURCHASE_STOCK_TYPE_LABEL[stockType];
  return stockType;
}

export const PURCHASE_CHANNELS = [
  "CASH",
  "TRANSFER",
  "CREDIT",
  "OTHER",
] as const;

export type PurchaseChannel = (typeof PURCHASE_CHANNELS)[number];

export const PURCHASE_CHANNEL_LABEL: Record<PurchaseChannel, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอน",
  CREDIT: "เครดิต",
  OTHER: "อื่น ๆ",
};

export const PURCHASE_STATUSES = ["DRAFT", "CONFIRMED", "CANCELLED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  DRAFT: "ฉบับร่าง",
  CONFIRMED: "ยืนยันแล้ว",
  CANCELLED: "ยกเลิก",
};

export const MAX_PURCHASE_IMAGES = 20;

export const purchaseLineSchema = z
  .object({
    branchNonMenuItemId: z.string().trim().min(1).nullable().optional(),
    branchMenuItemId: z.string().trim().min(1).nullable().optional(),
    itemName: z.string().trim().min(1).max(120),
    itemCode: z.string().trim().max(40).nullable().optional(),
    unit: z.string().trim().min(1).max(40),
    unitPrice: z.number().finite().min(0).max(10_000_000).nullable().optional(),
    /** Client hint; server overwrites from master when linked. */
    systemUnitPrice: z
      .number()
      .finite()
      .min(0)
      .max(10_000_000)
      .nullable()
      .optional(),
    quantity: z.number().int().positive().max(1_000_000),
    stockType: z.enum(PURCHASE_STOCK_TYPES),
  })
  .superRefine((line, ctx) => {
    const nonMenu = line.branchNonMenuItemId?.trim() || null;
    const menu = line.branchMenuItemId?.trim() || null;
    if (line.stockType === "RAW_MATERIAL") {
      if (!menu) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "วัตถุดิบต้องเลือกจากรายการขาย",
          path: ["branchMenuItemId"],
        });
      }
      if (nonMenu) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "วัตถุดิบไม่ใช้สินค้า Non-menu",
          path: ["branchNonMenuItemId"],
        });
      }
      return;
    }
    if (!nonMenu) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ต้องเลือกสินค้าจากสต๊อกสาขา",
        path: ["branchNonMenuItemId"],
      });
    }
  });

export const purchaseCreateSchema = z.object({
  documentDate: z
    .string()
    .refine(isBangkokDateKey, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)"),
  documentNo: z.string().trim().min(4).max(80),
  channel: z.enum(PURCHASE_CHANNELS).default("CASH"),
  channelNote: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  imageUrls: z.array(z.string().trim().min(1).max(500)).max(MAX_PURCHASE_IMAGES),
  lines: z.array(purchaseLineSchema).min(1).max(100),
  /** If true, create as CONFIRMED and stock-in immediately. */
  confirm: z.boolean().optional(),
});

export const purchaseUpdateSchema = z.object({
  documentDate: z
    .string()
    .refine(isBangkokDateKey, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)")
    .optional(),
  documentNo: z.string().trim().min(4).max(80).optional(),
  channel: z.enum(PURCHASE_CHANNELS).optional(),
  channelNote: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  imageUrls: z
    .array(z.string().trim().min(1).max(500))
    .max(MAX_PURCHASE_IMAGES)
    .optional(),
  lines: z.array(purchaseLineSchema).min(1).max(100).optional(),
});

export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>;
export type PurchaseUpdateInput = z.infer<typeof purchaseUpdateSchema>;

export { expenseDateFromKey as purchaseDateFromKey, expenseDateKey as purchaseDateKey };

export function encodePurchaseImages(urls: string[]): string | null {
  const clean = urls
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, MAX_PURCHASE_IMAGES);
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}

export function parsePurchaseImages(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_PURCHASE_IMAGES);
  } catch {
    return [];
  }
}

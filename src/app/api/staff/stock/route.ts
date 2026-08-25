import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getActiveShift } from "@/lib/branch-shift";
import {
  bangkokDateKey,
  startOfBangkokDayFromKey,
} from "@/lib/constants";
import {
  assignStableMenuSequence,
  sortStaffMenuItems,
  withMenuOrderFields,
} from "@/lib/staff-menu-order";
import { assertBrandWriteAllowedByBranchId } from "@/lib/brand-plan";
import {
  STOCK_COUNT_TIMING_LABEL,
  type StockCountTiming,
} from "@/lib/stock-count-timing";
import { BRANCH_WASTE_HISTORY_TYPES } from "@/lib/stock-outbound";
import {
  encodeMovementImages,
  MAX_STOCK_MOVEMENT_IMAGES,
} from "@/lib/stock-movement-images";

const WASTE_HISTORY_TYPES = BRANCH_WASTE_HISTORY_TYPES;

const movementImageUrlsSchema = z
  .array(z.string().trim().min(1).max(2000))
  .max(MAX_STOCK_MOVEMENT_IMAGES)
  .optional();

function resolveMovementImageUrl(body: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): string | null {
  if (body.imageUrls?.length) {
    return encodeMovementImages(body.imageUrls);
  }
  const single = body.imageUrl?.trim();
  return single ? single : null;
}

function bangkokMonthBounds(now = new Date()) {
  const todayKey = bangkokDateKey(now);
  const [y, m] = todayKey.split("-").map(Number);
  const monthStartKey = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const nextMonthStartKey = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  const label = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    month: "short",
    year: "numeric",
  }).format(startOfBangkokDayFromKey(monthStartKey));
  return {
    start: startOfBangkokDayFromKey(monthStartKey),
    end: startOfBangkokDayFromKey(nextMonthStartKey),
    label,
  };
}

const summaryLineSchema = z.object({
  brandProductId: z.string(), // BranchMenuItem.id
  countedQty: z.number().int().min(0),
});

import {
  expectedDocumentKindForAction,
  generateStockDocumentNo,
  stockDocumentNoSchema,
  validateStockDocumentNo,
} from "@/lib/stock-document-no";

const batchIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .optional();

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("stock_in"),
    brandProductId: z.string(), // This is either menuItemId or nonMenuItemId
    quantity: z.number().int().positive(),
    /** Optional — server generates when omitted (older clients / empty submit) */
    documentNo: stockDocumentNoSchema.optional(),
    unitCost: z.number().min(0).nullable().optional(),
    supplier: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    batchId: batchIdSchema,
    skipDocumentCheck: z.boolean().optional(),
    /** YYYY-MM-DD receive day (menu/sale items) */
    receivedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** YYYY-MM-DD expiry (menu/sale items) */
    expiresAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    /** Shelf life days from receive → compute expiresAt if expiresAt omitted */
    shelfLifeDays: z.number().int().min(0).max(365).nullable().optional(),
    /** รูปประกอบรับเข้า (ถ้ามี) — URL เดียวหรือหลายรูป */
    imageUrl: z.string().trim().min(1).max(2000).optional(),
    imageUrls: movementImageUrlsSchema,
  }),
  z.object({
    action: z.literal("damage"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    documentNo: stockDocumentNoSchema.optional(),
    reason: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    imageUrl: z.string().trim().min(1).max(2000).optional(),
    imageUrls: movementImageUrlsSchema,
    batchId: batchIdSchema,
    skipDocumentCheck: z.boolean().optional(),
  }).superRefine((data, ctx) => {
    const urls = data.imageUrls?.filter(Boolean) ?? [];
    const single = data.imageUrl?.trim();
    if (urls.length === 0 && !single) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "กรุณาแนบรูปอย่างน้อย 1 รูป",
        path: ["imageUrls"],
      });
    }
  }),
  z.object({
    action: z.literal("lost"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    documentNo: stockDocumentNoSchema.optional(),
    reason: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    imageUrl: z.string().trim().min(1).max(2000).optional(),
    imageUrls: movementImageUrlsSchema,
    batchId: batchIdSchema,
    skipDocumentCheck: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("issue"),
    brandProductId: z.string(),
    quantity: z.number().int().positive(),
    documentNo: stockDocumentNoSchema.optional(),
    note: z.string().trim().min(1, "กรุณากรอกรายละเอียด").max(300),
    imageUrl: z.string().trim().min(1).max(2000).optional(),
    imageUrls: movementImageUrlsSchema,
    batchId: batchIdSchema,
    skipDocumentCheck: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    brandProductId: z.string(),
    quantity: z.number().int().min(0),
    note: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("summary"),
    stockType: z.enum(["SALE_ITEM", "CONSUMABLE", "EQUIPMENT"]).default("SALE_ITEM"),
    timing: z
      .enum(["BEFORE_OPEN", "AFTER_CLOSE", "RECHECK"])
      .default("AFTER_CLOSE"),
    lines: z.array(summaryLineSchema).min(1),
    cash: z.number().min(0).default(0),
    transfer: z.number().min(0).default(0),
    change: z.number().min(0).default(0),
    customers: z.number().int().min(0).default(0),
  }),
]);

export async function GET() {
  try {
    const { ensureProdSchemaCompat } = await import("@/lib/schema-compat");
    await ensureProdSchemaCompat();

    const session = await requireStaff();
    // Always select scalars — do not load full Branch (isTest etc. may lag migrate on prod).
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        brandId: true,
        stockEnabled: true,
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const menuItemSelectBase = {
      id: true,
      name: true,
      price: true,
      sortOrder: true,
      imageUrl: true,
      category: {
        select: {
          name: true,
          sortOrder: true,
          stockExempt: true,
        },
      },
      stock: { select: { quantity: true } },
      optionGroupLinks: {
        select: { group: { select: { mode: true } } },
      },
    } as const;

    let menuItems: Array<{
      id: string;
      name: string;
      price: unknown;
      sortOrder: number;
      imageUrl: string | null;
      defaultShelfLifeDays?: number | null;
      category: {
        name: string;
        sortOrder: number;
        stockExempt: boolean;
      } | null;
      stock: { quantity: number } | null;
      optionGroupLinks: Array<{ group: { mode: string } }>;
    }>;
    try {
      menuItems = await prisma.branchMenuItem.findMany({
        where: { branchId: branch.id, isHidden: false },
        select: {
          ...menuItemSelectBase,
          defaultShelfLifeDays: true,
        },
        orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/defaultShelfLifeDays|Unknown (arg|field)|column/i.test(msg)) {
        throw e;
      }
      console.warn(
        "[staff/stock] defaultShelfLifeDays select skipped — regenerate Prisma client",
      );
      menuItems = await prisma.branchMenuItem.findMany({
        where: { branchId: branch.id, isHidden: false },
        select: menuItemSelectBase,
        orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      });
    }

    const nonMenuItems = await prisma.branchNonMenuItem.findMany({
      where: { branchId: branch.id },
      select: {
        id: true,
        name: true,
        unit: true,
        stockType: true,
        quantity: true,
        price: true,
        imageUrl: true,
      },
      orderBy: { name: "asc" },
    });

    const products: Array<Record<string, unknown>> = [];
    const balances: Array<Record<string, unknown>> = [];

    const priceByProductId = new Map<string, number>();

    // Map Menu Items (skip promo packs + stock-exempt categories — no receive needed)
    for (const item of menuItems) {
      const isPromo = item.optionGroupLinks.some(
        (l) => l.group.mode === "FROM_MENU",
      );
      if (isPromo || item.category?.stockExempt) continue;

      const price = Number(item.price ?? 0);
      priceByProductId.set(item.id, price);

      products.push({
        id: item.id,
        name: item.name,
        unit: "รายการ",
        stockType: "SALE_ITEM",
        category: item.category?.name ?? "เมนู",
        sortOrder: item.sortOrder,
        categorySortOrder: item.category?.sortOrder ?? 999,
        lowStockAlert: 0,
        trackStock: true,
        imageUrl: item.imageUrl,
        isMenu: true,
        price,
        defaultShelfLifeDays: item.defaultShelfLifeDays ?? null,
      });
      balances.push({
        id: item.id, // Frontend uses product.id anyway
        quantity: item.stock?.quantity ?? 0,
        product: {
          id: item.id,
          name: item.name,
          unit: "รายการ",
          stockType: "SALE_ITEM",
          category: item.category?.name ?? "เมนู",
          sortOrder: item.sortOrder,
          categorySortOrder: item.category?.sortOrder ?? 999,
          lowStockAlert: 0,
          price,
        },
      });
    }

    // Map Non-Menu Items
    for (const item of nonMenuItems) {
      const typeLabel = item.stockType === "CONSUMABLE" ? "ของสิ้นเปลือง" : "อุปกรณ์";
      const price = Number(item.price ?? 0);
      priceByProductId.set(item.id, price);

      products.push({
        id: item.id,
        name: item.name,
        unit: item.unit,
        stockType: item.stockType,
        category: typeLabel,
        sortOrder: 0,
        categorySortOrder: 999,
        lowStockAlert: 0,
        trackStock: true,
        imageUrl: item.imageUrl,
        isMenu: false,
        price,
      });
      balances.push({
        id: item.id,
        quantity: item.quantity,
        product: {
          id: item.id,
          name: item.name,
          unit: item.unit,
          stockType: item.stockType,
          category: typeLabel,
          sortOrder: 0,
          categorySortOrder: 999,
          lowStockAlert: 0,
          price,
        },
      });
    }

    const emptyTypeSummary = () => ({ quantity: 0, valueBaht: 0 });
    const currentByType: Record<
      "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT",
      { quantity: number; valueBaht: number }
    > = {
      SALE_ITEM: emptyTypeSummary(),
      CONSUMABLE: emptyTypeSummary(),
      EQUIPMENT: emptyTypeSummary(),
    };
    for (const bal of balances) {
      const stockType = (bal.product as { stockType?: string }).stockType as
        | keyof typeof currentByType
        | undefined;
      if (!stockType || !(stockType in currentByType)) continue;
      const qty = Math.max(0, Number(bal.quantity) || 0);
      const unitPrice =
        Number((bal.product as { price?: number }).price) || 0;
      currentByType[stockType].quantity += qty;
      currentByType[stockType].valueBaht += qty * unitPrice;
    }

    const month = bangkokMonthBounds();
    const wasteByType: typeof currentByType = {
      SALE_ITEM: emptyTypeSummary(),
      CONSUMABLE: emptyTypeSummary(),
      EQUIPMENT: emptyTypeSummary(),
    };

    // History may miss cancel columns if migrate lag — use select without them.
    try {
      const [menuWaste, nonMenuWaste] = await Promise.all([
        prisma.branchMenuItemStockHistory.findMany({
          where: {
            branchId: branch.id,
            type: { in: [...WASTE_HISTORY_TYPES] },
            createdAt: { gte: month.start, lt: month.end },
          },
          select: { menuItemId: true, quantity: true },
        }),
        prisma.branchNonMenuItemHistory.findMany({
          where: {
            item: { branchId: branch.id },
            type: { in: [...WASTE_HISTORY_TYPES] },
            createdAt: { gte: month.start, lt: month.end },
          },
          select: {
            quantity: true,
            item: { select: { id: true, stockType: true, price: true } },
          },
        }),
      ]);

      for (const row of menuWaste) {
        const qty = Math.abs(row.quantity);
        if (qty <= 0) continue;
        const unitPrice = priceByProductId.get(row.menuItemId) ?? 0;
        wasteByType.SALE_ITEM.quantity += qty;
        wasteByType.SALE_ITEM.valueBaht += qty * unitPrice;
      }
      for (const row of nonMenuWaste) {
        const qty = Math.abs(row.quantity);
        if (qty <= 0) continue;
        const stockType = row.item.stockType as keyof typeof wasteByType;
        if (!(stockType in wasteByType)) continue;
        const unitPrice =
          priceByProductId.get(row.item.id) ?? Number(row.item.price ?? 0);
        wasteByType[stockType].quantity += qty;
        wasteByType[stockType].valueBaht += qty * unitPrice;
      }
    } catch (e) {
      console.error(
        "[staff/stock] waste summary skipped",
        e instanceof Error ? e.message : e,
      );
    }

    let mappedMovements: Array<Record<string, unknown>> = [];
    try {
      // Select scalars only — avoid Prisma selecting cancel columns if DB lags.
      const [recentMenuMovements, recentNonMenuMovements] = await Promise.all([
        prisma.branchMenuItemStockHistory.findMany({
          where: { branchId: branch.id },
          select: {
            id: true,
            type: true,
            quantity: true,
            createdAt: true,
            note: true,
            menuItemId: true,
            menuItem: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.branchNonMenuItemHistory.findMany({
          where: { item: { branchId: branch.id } },
          select: {
            id: true,
            type: true,
            quantity: true,
            createdAt: true,
            note: true,
            branchNonMenuItemId: true,
            item: {
              select: { name: true, unit: true, stockType: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
      ]);

      mappedMovements = [
        ...recentMenuMovements.map((m) => ({
          id: m.id,
          type: m.type,
          quantity: m.quantity,
          createdAt: m.createdAt.toISOString(),
          note: m.note,
          product: {
            id: m.menuItemId,
            name: m.menuItem.name,
            unit: "รายการ",
            stockType: "SALE_ITEM",
          },
        })),
        ...recentNonMenuMovements.map((m) => ({
          id: m.id,
          type: m.type,
          quantity: m.quantity,
          createdAt: m.createdAt.toISOString(),
          note: m.note,
          product: {
            id: m.branchNonMenuItemId,
            name: m.item.name,
            unit: m.item.unit,
            stockType: m.item.stockType,
          },
        })),
      ];

      mappedMovements.sort(
        (a, b) =>
          new Date(String(b.createdAt)).getTime() -
          new Date(String(a.createdAt)).getTime(),
      );
      mappedMovements = mappedMovements.slice(0, 50);
    } catch (e) {
      console.error(
        "[staff/stock] recent movements skipped",
        e instanceof Error ? e.message : e,
      );
    }

    let pending: Array<{
      id: string;
      quantity: number;
      note: string | null;
      createdAt: string;
      kind: string;
      product: {
        id: string;
        name: string;
        unit: string;
        stockType: string;
      };
      sourceBranch: { id: string; name: string } | null;
    }> = [];
    try {
      const pendingRows = await prisma.stockTransfer.findMany({
        where: {
          branchId: branch.id,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          quantity: true,
          note: true,
          createdAt: true,
          kind: true,
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
              stockType: true,
            },
          },
          sourceBranch: { select: { id: true, name: true } },
        },
      });
      pending = pendingRows.map((row) => ({
        id: row.id,
        quantity: row.quantity,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        kind: row.kind,
        product: {
          id: row.product.id,
          name: row.product.name,
          unit: row.product.unit,
          stockType: row.product.stockType,
        },
        sourceBranch: row.sourceBranch,
      }));
    } catch (e) {
      console.error(
        "[staff/stock] pending transfers skipped",
        e instanceof Error ? e.message : e,
      );
    }

    let lastStockCountAt: string | null = null;
    let lastSaleAt: string | null = null;
    const lastStockCountAtByType: Record<
      "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT",
      string | null
    > = {
      SALE_ITEM: null,
      CONSUMABLE: null,
      EQUIPMENT: null,
    };
    try {
      const [recentCounts, lastSale] = await Promise.all([
        prisma.stockCount.findMany({
          where: {
            branchId: branch.id,
            status: { in: ["IN_PROGRESS", "COMPLETED"] },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 40,
          select: { createdAt: true, completedAt: true, note: true, name: true },
        }),
        prisma.order.findFirst({
          where: {
            branchId: branch.id,
            awaitingPhotoKey: false,
            status: {
              in: [
                "WAITING_FOR_STORE_ACCEPTANCE",
                "PREPARING",
                "READY_FOR_PICKUP",
                "READY_FOR_DELIVERY",
                "DELIVERING",
                "COMPLETED",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

      for (const row of recentCounts) {
        let stockType: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT" = "SALE_ITEM";
        try {
          const note = row.note ? (JSON.parse(row.note) as { stockType?: string }) : null;
          if (
            note?.stockType === "SALE_ITEM" ||
            note?.stockType === "CONSUMABLE" ||
            note?.stockType === "EQUIPMENT"
          ) {
            stockType = note.stockType;
          } else if (row.name.includes("ของสิ้นเปลือง")) {
            stockType = "CONSUMABLE";
          } else if (row.name.includes("อุปกรณ์")) {
            stockType = "EQUIPMENT";
          }
        } catch {
          if (row.name.includes("ของสิ้นเปลือง")) stockType = "CONSUMABLE";
          else if (row.name.includes("อุปกรณ์")) stockType = "EQUIPMENT";
        }
        if (lastStockCountAtByType[stockType]) continue;
        lastStockCountAtByType[stockType] = (
          row.completedAt ?? row.createdAt
        ).toISOString();
      }

      if (recentCounts[0]) {
        lastStockCountAt = (
          recentCounts[0].completedAt ?? recentCounts[0].createdAt
        ).toISOString();
      }
      lastSaleAt = lastSale?.createdAt.toISOString() ?? null;
    } catch (e) {
      console.error(
        "[staff/stock] last activity skipped",
        e instanceof Error ? e.message : e,
      );
    }

    let brandBranches: Array<{ id: string; name: string }> = [];
    if (branch.brandId) {
      try {
        brandBranches = await prisma.branch.findMany({
          where: {
            brandId: branch.brandId,
            id: { not: branch.id },
            kind: "STORE",
            isHidden: false,
            isTest: false,
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
      } catch (e) {
        console.error(
          "[staff/stock] brandBranches skipped",
          e instanceof Error ? e.message : e,
        );
      }
    }

    return jsonOk({
      stockActive: true,
      brandId: branch.brandId,
      locationId: branch.id,
      allowNegativeStock: true,
      brandBranches,
      pending,
      balances,
      products,
      lowItems: balances.filter((b) => Number(b.quantity) <= 0),
      counts: [],
      recentMovements: mappedMovements,
      lastStockCountAt,
      lastStockCountAtByType,
      lastSaleAt,
      summary: {
        monthLabel: month.label,
        currentByType,
        wasteByType,
      },
    });
  } catch (error) {
    console.error(
      "[staff/stock GET]",
      error instanceof Error ? error.message : error,
    );
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    if (!session.staffId) return jsonError("ไม่พบข้อมูลพนักงาน", 401);
    await assertBrandWriteAllowedByBranchId(session.branchId);
    const body = postSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        brandId: true,
        stockEnabled: true,
        name: true,
        code: true,
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    // End-of-day stock (+ cash when SALE_ITEM) summary by stock type
    if (body.action === "summary") {
      const stockType = body.stockType;
      const timing = body.timing as StockCountTiming;
      const timingLabel = STOCK_COUNT_TIMING_LABEL[timing];
      const lineIds = body.lines.map((l) => l.brandProductId);
      const typeLabel =
        stockType === "SALE_ITEM"
          ? "เมนูขาย"
          : stockType === "CONSUMABLE"
            ? "ของสิ้นเปลือง"
            : "อุปกรณ์";

      const activeShift = await getActiveShift(branch.id);
      const countLinesPayload: Array<{
        menuItemId?: string;
        nonMenuItemId?: string;
        name: string;
        systemQty: number;
        countedQty: number;
        unitPrice: number;
        unit: string;
        stockType: typeof stockType;
        seq: number;
      }> = [];

      if (stockType === "SALE_ITEM") {
        // SALE_ITEM: record count only — admin must convert/apply before stock adjusts
        const [menuItems, catalogMenus] = await Promise.all([
          prisma.branchMenuItem.findMany({
            where: { branchId: branch.id, id: { in: lineIds } },
            include: { stock: true },
          }),
          prisma.branchMenuItem.findMany({
            where: { branchId: branch.id, isHidden: false },
            select: {
              id: true,
              name: true,
              sortOrder: true,
              category: { select: { sortOrder: true, stockExempt: true } },
              optionGroupLinks: {
                select: { group: { select: { mode: true } } },
              },
            },
          }),
        ]);
        const menuMap = new Map(menuItems.map((m) => [m.id, m]));

        for (const line of body.lines) {
          if (!menuMap.has(line.brandProductId)) {
            return jsonError(`ไม่พบเมนูในสาขา: ${line.brandProductId}`);
          }
        }

        const saleCatalog = catalogMenus.filter((item) => {
          const isPromo = item.optionGroupLinks.some(
            (l) => l.group.mode === "FROM_MENU",
          );
          return !isPromo && !item.category?.stockExempt;
        });
        const sortedSaleCatalog = sortStaffMenuItems(
          saleCatalog.map((item) =>
            withMenuOrderFields({
              id: item.id,
              name: item.name,
              sortOrder: item.sortOrder,
              category: item.category,
            }),
          ),
        );
        const seqById = assignStableMenuSequence(sortedSaleCatalog);

        for (const line of body.lines) {
          const menu = menuMap.get(line.brandProductId)!;
          const oldQty = menu.stock?.quantity ?? 0;
          const newQty = line.countedQty;
          const unitPrice = Number(menu.price ?? 0);
          countLinesPayload.push({
            menuItemId: menu.id,
            name: menu.name,
            systemQty: oldQty,
            countedQty: newQty,
            unitPrice,
            unit: "รายการ",
            stockType,
            seq: seqById.get(menu.id) ?? 0,
          });
        }
      } else {
        const nonMenuItems = await prisma.branchNonMenuItem.findMany({
          where: {
            branchId: branch.id,
            stockType,
            id: { in: lineIds },
          },
        });
        const itemMap = new Map(nonMenuItems.map((m) => [m.id, m]));

        for (const line of body.lines) {
          if (!itemMap.has(line.brandProductId)) {
            return jsonError(`ไม่พบรายการในสาขา: ${line.brandProductId}`);
          }
        }

        const sorted = [...nonMenuItems].sort((a, b) =>
          a.name.localeCompare(b.name, "th"),
        );
        const seqById = new Map(sorted.map((item, i) => [item.id, i + 1]));

        await prisma.$transaction(
          async (tx) => {
            for (const line of body.lines) {
              const item = itemMap.get(line.brandProductId)!;
              const oldQty = item.quantity;
              const newQty = line.countedQty;
              const actualDiff = newQty - oldQty;
              const unitPrice = Number(item.price ?? 0);

              if (actualDiff !== 0) {
                await tx.branchNonMenuItem.update({
                  where: { id: item.id },
                  data: { quantity: newQty },
                });

                await tx.branchNonMenuItemHistory.create({
                  data: {
                    branchNonMenuItemId: item.id,
                    quantity: actualDiff,
                    type: "ADJUST",
                    note: `สรุปยอดสต๊อก · ${timingLabel} · ${typeLabel} (นับได้ ${newQty})`,
                    createdByStaffId: session.staffId,
                  },
                });
              }

              countLinesPayload.push({
                nonMenuItemId: item.id,
                name: item.name,
                systemQty: oldQty,
                countedQty: newQty,
                unitPrice,
                unit: item.unit,
                stockType,
                seq: seqById.get(item.id) ?? 0,
              });
            }
          },
          { timeout: 120_000, maxWait: 20_000 },
        );
      }

      countLinesPayload.sort((a, b) => {
        if (a.seq && b.seq && a.seq !== b.seq) return a.seq - b.seq;
        return a.name.localeCompare(b.name, "th");
      });

      if (!branch.brandId) {
        return jsonError("สาขานี้ยังไม่ได้ผูกแบรนด์ ไม่สามารถบันทึกสรุปยอดได้");
      }

      let location = await prisma.stockLocation.findFirst({
        where: { branchId: branch.id, type: "BRANCH" },
      });
      if (!location) {
        location = await prisma.stockLocation.create({
          data: {
            brandId: branch.brandId,
            branchId: branch.id,
            type: "BRANCH",
            name: branch.name || "สาขา",
          },
        });
      }

      const roundLabel = activeShift?.roundNumber ?? "—";
      const dateLabel = new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());
      const titlePrefix =
        stockType === "SALE_ITEM"
          ? "สรุปยอดสต๊อกและขายราย"
          : "สรุปยอดสต๊อก";
      // SALE_ITEM waits for admin convert; other types apply stock immediately
      const pendingAdmin = stockType === "SALE_ITEM";
      const count = await prisma.stockCount.create({
        data: {
          brandId: branch.brandId,
          branchId: branch.id,
          shiftId: activeShift?.id ?? null,
          stockLocationId: location.id,
          name: `${titlePrefix} · ${timingLabel} · ${typeLabel} · รอบที่ ${roundLabel} (${dateLabel})`,
          status: pendingAdmin ? "IN_PROGRESS" : "COMPLETED",
          completedAt: pendingAdmin ? null : new Date(),
          createdByStaffId: session.staffId,
          note: JSON.stringify({
            stockType,
            timing,
            pendingAdminApply: pendingAdmin,
            cash: stockType === "SALE_ITEM" ? body.cash : 0,
            transfer: stockType === "SALE_ITEM" ? body.transfer : 0,
            change: stockType === "SALE_ITEM" ? body.change : 0,
            customers: stockType === "SALE_ITEM" ? body.customers : 0,
            lines: countLinesPayload,
          }),
        },
      });

      return jsonOk(
        {
          ok: true,
          countId: count.id,
          status: count.status,
          pendingAdminApply: pendingAdmin,
        },
        201,
      );
    }

    let documentNo: string | null = null;
    if (
      body.action === "stock_in" ||
      body.action === "issue" ||
      body.action === "damage" ||
      (body.action === "lost" && body.documentNo)
    ) {
      const rawDoc =
        body.action === "lost"
          ? body.documentNo
          : "documentNo" in body
            ? body.documentNo
            : undefined;
      if (rawDoc) {
        documentNo = await validateStockDocumentNo({
          documentNo: rawDoc,
          action: body.action,
          skipAvailabilityCheck: body.skipDocumentCheck,
        });
      } else if (
        body.action === "stock_in" ||
        body.action === "issue" ||
        body.action === "damage"
      ) {
        const batchId =
          "batchId" in body && body.batchId ? body.batchId : null;
        if (batchId && body.skipDocumentCheck) {
          const fromBatch =
            (await prisma.branchMenuItemStockHistory.findFirst({
              where: { batchId, documentNo: { not: null } },
              select: { documentNo: true },
              orderBy: { createdAt: "asc" },
            })) ??
            (await prisma.branchNonMenuItemHistory.findFirst({
              where: { batchId, documentNo: { not: null } },
              select: { documentNo: true },
              orderBy: { createdAt: "asc" },
            }));
          if (fromBatch?.documentNo) {
            documentNo = fromBatch.documentNo;
          }
        }
        if (!documentNo) {
          const kind = expectedDocumentKindForAction(body.action);
          if (kind) {
            documentNo = await generateStockDocumentNo({
              kind,
              branchCode: branch.code ?? "",
              branchId: branch.id,
            });
          }
        }
      }
    }

    const storesMovementImage =
      body.action === "stock_in" ||
      body.action === "issue" ||
      body.action === "damage" ||
      body.action === "lost";
    const storesBatchId =
      body.action === "stock_in" ||
      body.action === "issue" ||
      body.action === "damage" ||
      body.action === "lost";
    const movementImageUrl = storesMovementImage
      ? resolveMovementImageUrl(body)
      : null;

    const targetId = body.brandProductId;
    
    // Check if non-menu item
    const nonMenu = await prisma.branchNonMenuItem.findUnique({
      where: { id: targetId },
    });

    let oldQty = 0;
    let newQty = 0;

    if (nonMenu) {
      oldQty = nonMenu.quantity;
      if (body.action === "stock_in") {
        newQty = oldQty + body.quantity;
      } else if (body.action === "adjust") {
        newQty = body.quantity;
      } else {
        newQty = oldQty - body.quantity;
      }
      
      const actualDiff = newQty - oldQty;

      if (actualDiff !== 0 || body.action === "adjust") {
        await prisma.branchNonMenuItem.update({
          where: { id: targetId },
          data: { quantity: newQty },
        });

        if (actualDiff !== 0) {
          const batchId = storesBatchId ? (body.batchId ?? null) : null;
          await prisma.branchNonMenuItemHistory.create({
            data: {
              branchNonMenuItemId: targetId,
              quantity: actualDiff,
              type: body.action.toUpperCase(),
              note: body.note ?? null,
              imageUrl: movementImageUrl,
              batchId,
              documentNo,
              createdByStaffId: session.staffId,
            },
          });
        }
      }
    } else {
      // Must be a menu item
      const menuItem = await prisma.branchMenuItem.findFirst({
        where: { id: targetId, branchId: branch.id },
        include: { stock: true },
      });
      if (!menuItem) return jsonError("ไม่พบรายการสินค้า", 404);

      oldQty = menuItem.stock?.quantity ?? 0;

      let receiveDayKey = bangkokDateKey();
      let receiveAt: Date | null = null;
      let expiresAt: Date | null = null;

      if (body.action === "stock_in") {
        // Soft defaults for aging: receive day = today (or provided).
        // Expiry only when staff/admin already set shelf life — never block receive.
        receiveDayKey = body.receivedAt ?? bangkokDateKey();
        if (receiveDayKey > bangkokDateKey()) {
          return jsonError("วันที่รับเข้าต้องไม่เกินวันนี้");
        }
        receiveAt = startOfBangkokDayFromKey(receiveDayKey);

        const shelfDays =
          body.shelfLifeDays != null
            ? body.shelfLifeDays
            : menuItem.defaultShelfLifeDays;

        if (body.expiresAt) {
          if (body.expiresAt < receiveDayKey) {
            return jsonError("วันหมดอายุต้องไม่ก่อนวันรับเข้า");
          }
          expiresAt = startOfBangkokDayFromKey(body.expiresAt);
        } else if (shelfDays != null && shelfDays >= 0) {
          const receiveNoon = new Date(`${receiveDayKey}T12:00:00+07:00`);
          receiveNoon.setDate(receiveNoon.getDate() + shelfDays);
          const expKey = bangkokDateKey(receiveNoon);
          expiresAt = startOfBangkokDayFromKey(expKey);
        }

        if (
          body.shelfLifeDays != null &&
          body.shelfLifeDays !== menuItem.defaultShelfLifeDays
        ) {
          try {
            await prisma.branchMenuItem.update({
              where: { id: menuItem.id },
              data: { defaultShelfLifeDays: body.shelfLifeDays },
            });
          } catch {
            /* column may lag */
          }
        }

        newQty = oldQty + body.quantity;
      } else if (body.action === "adjust") {
        newQty = body.quantity;
      } else {
        newQty = oldQty - body.quantity;
      }
      
      const actualDiff = newQty - oldQty;

      if (actualDiff !== 0 || body.action === "adjust") {
        await prisma.$transaction(async (tx) => {
          await tx.branchMenuItemStock.upsert({
            where: { menuItemId: targetId },
            update: { quantity: newQty },
            create: {
              branchId: session.branchId,
              menuItemId: targetId,
              quantity: newQty,
            },
          });

          // Keep sold-out flag in sync so key-order / customer menus reflect stock
          await tx.branchMenuItem.update({
            where: { id: targetId },
            data: { isOutOfStock: newQty <= 0 },
          });

          if (actualDiff !== 0) {
            const batchId = storesBatchId ? (body.batchId ?? null) : null;
            const historyData: {
              branchId: string;
              menuItemId: string;
              quantity: number;
              type: string;
              documentNo?: string | null;
              note: string | null;
              imageUrl: string | null;
              batchId: string | null;
              createdByStaffId: string;
              receivedAt?: Date | null;
              expiresAt?: Date | null;
            } = {
              branchId: session.branchId,
              menuItemId: targetId,
              quantity: actualDiff,
              type: body.action.toUpperCase(),
              note: body.note ?? null,
              imageUrl: movementImageUrl,
              batchId,
              createdByStaffId: session.staffId,
            };
            if (documentNo) {
              historyData.documentNo = documentNo;
            }
            if (body.action === "stock_in") {
              historyData.receivedAt = receiveAt;
              historyData.expiresAt = expiresAt;
            }
            try {
              await tx.branchMenuItemStockHistory.create({
                data: historyData,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (!/receivedAt|expiresAt|Unknown arg|column/i.test(msg)) throw e;
              const { receivedAt: _r, expiresAt: _e, ...fallback } = historyData;
              await tx.branchMenuItemStockHistory.create({ data: fallback });
            }
          }
        });
      }
    }

    return jsonOk({ ok: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

import { OrderStatus } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { getCalendarDayState } from "@/lib/operating-day";
import { getActiveShift, serializeShift, shiftCalendarDateKey } from "@/lib/branch-shift";
import { isBranchStockActive } from "@/lib/stock";
import { queueBusinessDateFromKey } from "@/lib/constants";
import {
  isOrderCountableRevenue,
  orderGrandTotal,
} from "@/lib/order-totals";

const COUNTABLE_STATUSES: OrderStatus[] = [
  OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.DELIVERING,
  OrderStatus.COMPLETED,
];

/** GET — ธีมแบรนด์ + สถานะรอบทำงาน + badge สำหรับ shell */
export async function GET() {
  try {
    const { ensureProdSchemaCompat } = await import("@/lib/schema-compat");
    await ensureProdSchemaCompat();

    const session = await requireStaff();

    type BranchBranding = {
      isOpen: boolean;
      stockEnabled: boolean;
      brandId: string | null;
      operatingMode: string;
      weighSalesEnabled?: boolean;
      brand: {
        stockEnabled: boolean;
        coverImageUrl: string | null;
        bbqEnabled: boolean;
      } | null;
    };

    async function loadBranch(): Promise<BranchBranding | null> {
      try {
        return await prisma.branch.findUnique({
          where: { id: session.branchId },
          select: {
            isOpen: true,
            stockEnabled: true,
            brandId: true,
            operatingMode: true,
            weighSalesEnabled: true,
            brand: {
              select: {
                stockEnabled: true,
                coverImageUrl: true,
                bbqEnabled: true,
              },
            },
          },
        });
      } catch (e) {
        // Stale Prisma client / migrate lag — degrade without weigh fields
        const msg = e instanceof Error ? e.message : String(e);
        if (!/weighSalesEnabled|Unknown field|column/i.test(msg)) throw e;
        console.error("[staff/branding] weighSalesEnabled fallback", msg);
        return prisma.branch.findUnique({
          where: { id: session.branchId },
          select: {
            isOpen: true,
            stockEnabled: true,
            brandId: true,
            operatingMode: true,
            brand: {
              select: {
                stockEnabled: true,
                coverImageUrl: true,
                bbqEnabled: true,
              },
            },
          },
        });
      }
    }

    const [branch, activeShift, pendingOrderCount, pendingStockCount] =
      await Promise.all([
        loadBranch(),
        getActiveShift(session.branchId),
        prisma.order.count({
          where: {
            branchId: session.branchId,
            status: OrderStatus.WAITING_FOR_STORE_ACCEPTANCE,
          },
        }),
        prisma.stockTransfer.count({
          where: {
            branchId: session.branchId,
            status: "PENDING",
          },
        }),
      ]);
    const day = getCalendarDayState();
    const canSell = Boolean(activeShift);
    const brandStockEnabled = Boolean(branch?.brand?.stockEnabled);
    const stockEnabled = Boolean(branch?.stockEnabled);
    const operatingMode = branch?.operatingMode ?? "NORMAL";
    const weighSalesEnabled = Boolean(branch?.weighSalesEnabled);
    const brandBbqEnabled = branch?.brand?.bbqEnabled !== false;
    const weighSalesAvailable =
      (operatingMode === "BBQ_WEIGH" ||
        (operatingMode === "NORMAL" && weighSalesEnabled)) &&
      brandBbqEnabled;
    const dualSellModes =
      operatingMode === "NORMAL" && weighSalesEnabled && brandBbqEnabled;
    const operatingDay = activeShift
      ? shiftCalendarDateKey(activeShift)
      : day.operatingDay;
    const businessDate = queueBusinessDateFromKey(operatingDay);

    let todayOrderCount = 0;
    try {
      todayOrderCount = await prisma.order.count({
        where: {
          branchId: session.branchId,
          queueBusinessDate: businessDate,
          status: { in: COUNTABLE_STATUSES },
        },
      });
    } catch (e) {
      console.error(
        "[staff/branding] today order count skipped",
        e instanceof Error ? e.message : e,
      );
    }

    // Bounded scan — avoid loading unbounded/cancelled orders as a full day bloates branding.
    let todayRevenueBaht = 0;
    try {
      const todayOrders = await prisma.order.findMany({
        where: {
          branchId: session.branchId,
          queueBusinessDate: businessDate,
          status: { in: COUNTABLE_STATUSES },
        },
        select: {
          status: true,
          awaitingPhotoKey: true,
          deliveryFee: true,
          discountAmount: true,
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              optionsPrice: true,
            },
          },
        },
        take: 1500,
        orderBy: { createdAt: "desc" },
      });

      for (const o of todayOrders) {
        if (!isOrderCountableRevenue(o)) continue;
        todayRevenueBaht += orderGrandTotal(
          o.items.map((i) => ({
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            optionsPrice: Number(i.optionsPrice),
          })),
          Number(o.deliveryFee),
          Number(o.discountAmount),
        );
      }
    } catch (e) {
      console.error(
        "[staff/branding] today revenue skipped",
        e instanceof Error ? e.message : e,
      );
    }

    return jsonOk({
      branchId: session.branchId,
      branchName: session.branchName,
      staffDisplayName: session.staffDisplayName,
      staffPhone: session.staffPhone,
      brand: {
        ...session.brand,
        coverImageUrl:
          branch?.brand?.coverImageUrl ??
          (session.brand as { coverImageUrl?: string | null } | undefined)
            ?.coverImageUrl ??
          null,
      },
      autoAcceptOrders: session.autoAcceptOrders ?? false,
      operatingDay,
      canToggleStore:
        session.staffRoles.includes("SELLER") ||
        session.staffRoles.includes("BOTH"),
      entryLocked: !canSell,
      canEnter: canSell,
      canSell,
      activeShift: activeShift ? serializeShift(activeShift) : null,
      isOpen: branch?.isOpen ?? false,
      tone: canSell ? "ok" : "locked",
      brandStockEnabled,
      stockEnabled,
      stockActive: isBranchStockActive({
        brandId: branch?.brandId,
        brandStockEnabled,
        branchStockEnabled: stockEnabled,
      }),
      operatingMode,
      weighSalesEnabled,
      weighSalesAvailable,
      dualSellModes,
      pendingOrderCount,
      pendingStockCount,
      todayOrderCount,
      todayRevenueBaht,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

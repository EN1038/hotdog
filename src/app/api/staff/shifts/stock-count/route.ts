import { z } from "zod";
import { StockMovementType } from "@prisma/client";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getActiveShift } from "@/lib/branch-shift";
import { isBranchStockActive, changeBalance, syncAfterBranchQtyChange } from "@/lib/stock";

const lineSchema = z.object({
  brandProductId: z.string(),
  countedQty: z.number().int().min(0),
  varianceReason: z.string().trim().max(300).optional().nullable(),
});

const postSchema = z.object({
  lines: z.array(lineSchema).min(1),
  note: z.string().trim().max(300).optional().nullable(),
});

export async function GET() {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        brandId: true,
        stockEnabled: true,
        brand: { select: { id: true, stockEnabled: true } },
      },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const stockActive = isBranchStockActive({
      brandId: branch.brandId,
      brandStockEnabled: branch.brand?.stockEnabled,
      branchStockEnabled: branch.stockEnabled,
    });

    if (!stockActive || !branch.brandId) {
      return jsonOk({ stockActive: false, hasActiveShift: false, products: [] });
    }

    const activeShift = await getActiveShift(branch.id);
    if (!activeShift) {
      return jsonOk({
        stockActive: true,
        hasActiveShift: false,
        activeShift: null,
        products: [],
      });
    }

    const location = await prisma.stockLocation.findFirst({
      where: { branchId: branch.id, type: "BRANCH" },
      include: { balances: true },
    });

    if (!location) {
      return jsonError("ไม่พบตำแหน่งคลังสินค้าสาขา", 404);
    }

    // Find all active products
    const products = await prisma.brandProduct.findMany({
      where: { brandId: branch.brandId, isActive: true },
      orderBy: [{ stockType: "asc" }, { name: "asc" }],
    });

    // Find previous completed count for this branch to get opening balance
    const prevCount = await prisma.stockCount.findFirst({
      where: {
        branchId: branch.id,
        status: "COMPLETED",
        id: { not: activeShift.id },
      },
      include: { lines: true },
      orderBy: { completedAt: "desc" },
    });

    // Map previous counted quantities
    const prevMap = new Map<string, number>();
    if (prevCount) {
      for (const line of prevCount.lines) {
        if (line.countedQty != null) {
          prevMap.set(line.brandProductId, line.countedQty);
        }
      }
    }

    // Map system balances
    const balanceMap = new Map<string, number>();
    for (const b of location.balances) {
      balanceMap.set(b.brandProductId, b.quantity);
    }

    const shiftOpenedAt = activeShift.openedAt;

    // Fetch movements during shift for this location
    const shiftMovements = await prisma.stockMovement.findMany({
      where: {
        stockLocationId: location.id,
        createdAt: { gte: shiftOpenedAt },
      },
    });

    // Fetch order sales during shift
    const shiftOrders = await prisma.order.findMany({
      where: {
        branchId: branch.id,
        shiftId: activeShift.id,
        status: { not: "CANCELLED" },
      },
      include: {
        items: {
          include: {
            branchMenuItem: { select: { brandProductId: true } },
          },
        },
      },
    });

    // Calculate sales qty per brandProductId
    const salesMap = new Map<string, number>();
    for (const order of shiftOrders) {
      for (const item of order.items) {
        const prodId = item.branchMenuItem?.brandProductId;
        if (prodId) {
          const qty = item.quantity + (item.giftQuantity || 0);
          salesMap.set(prodId, (salesMap.get(prodId) || 0) + qty);
        }
      }
    }

    // Calculate added and waste from movements
    const addedMap = new Map<string, number>();
    const wasteMap = new Map<string, number>();

    for (const m of shiftMovements) {
      if (m.type === "RECEIVE" || m.type === "STOCK_IN" || m.type === "TRANSFER") {
        addedMap.set(m.brandProductId, (addedMap.get(m.brandProductId) || 0) + m.quantity);
      } else if (
        m.type === "DAMAGE" ||
        m.type === "LOST" ||
        m.type === "ISSUE" ||
        m.type === "WASTE"
      ) {
        wasteMap.set(m.brandProductId, (wasteMap.get(m.brandProductId) || 0) + m.quantity);
      }
    }

    const items = products.map((p) => {
      const currentSystemQty = balanceMap.get(p.id) ?? 0;
      const prevQty = prevMap.has(p.id) ? prevMap.get(p.id)! : currentSystemQty;
      const addedQty = addedMap.get(p.id) ?? 0;
      const salesQty = salesMap.get(p.id) ?? 0;
      const wasteQty = wasteMap.get(p.id) ?? 0;

      // Expected = Opening + Added - Sales - Waste
      const expectedQty = Math.max(0, prevQty + addedQty - salesQty - wasteQty);

      return {
        product: {
          id: p.id,
          name: p.name,
          unit: p.unit,
          stockType: p.stockType,
          lowStockAlert: p.lowStockAlert,
          sellingPrice: p.sellingPrice,
        },
        prevQty,
        addedQty,
        salesQty,
        wasteQty,
        expectedQty,
        currentSystemQty,
      };
    });

    return jsonOk({
      stockActive: true,
      hasActiveShift: true,
      activeShift: {
        id: activeShift.id,
        roundNumber: activeShift.roundNumber,
        openedAt: activeShift.openedAt,
        calendarDate: activeShift.calendarDate,
      },
      items,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStaff();
    if (!session.staffId) return jsonError("ไม่พบข้อมูลพนักงาน", 401);

    const body = postSchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: {
        id: true,
        brandId: true,
        stockEnabled: true,
        brand: { select: { id: true, stockEnabled: true } },
      },
    });
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);

    if (
      !isBranchStockActive({
        brandId: branch.brandId,
        brandStockEnabled: branch.brand?.stockEnabled,
        branchStockEnabled: branch.stockEnabled,
      })
    ) {
      return jsonError("สาขานี้ยังไม่ได้เปิดระบบสต๊อก");
    }

    const activeShift = await getActiveShift(branch.id);
    if (!activeShift) {
      return jsonError("ไม่มีรอบกะขายที่กำลังเปิดอยู่");
    }

    const location = await prisma.stockLocation.findFirst({
      where: { branchId: branch.id, type: "BRANCH" },
    });
    if (!location) return jsonError("ไม่พบตำแหน่งสต๊อกสาขา");

    const result = await prisma.$transaction(async (tx) => {
      // Create StockCount record
      const count = await tx.stockCount.create({
        data: {
          brandId: branch.brandId!,
          branchId: branch.id,
          shiftId: activeShift.id,
          stockLocationId: location.id,
          name: `นับสต๊อกกะที่ ${activeShift.roundNumber} (${new Date().toLocaleDateString("th-TH")})`,
          status: "COMPLETED",
          completedAt: new Date(),
          createdByStaffId: session.staffId,
          note: body.note || null,
        },
      });

      const countLines = [];

      for (const line of body.lines) {
        // Fetch current system balance
        const balance = await tx.stockBalance.findUnique({
          where: {
            stockLocationId_brandProductId: {
              stockLocationId: location.id,
              brandProductId: line.brandProductId,
            },
          },
        });

        const currentSystemQty = balance?.quantity ?? 0;
        const countedQty = line.countedQty;
        const varianceQty = countedQty - currentSystemQty;

        const countLine = await tx.stockCountLine.create({
          data: {
            countId: count.id,
            brandProductId: line.brandProductId,
            systemQty: currentSystemQty,
            countedQty,
            expectedQty: currentSystemQty,
            varianceQty,
            varianceReason: line.varianceReason || null,
          },
        });
        countLines.push(countLine);

        // Update balance to countedQty
        const { beforeQty, afterQty } = await changeBalance(tx, {
          stockLocationId: location.id,
          brandProductId: line.brandProductId,
          delta: countedQty - currentSystemQty,
        });

        await syncAfterBranchQtyChange(tx, location, line.brandProductId, afterQty);

        // Record adjustment movement if variance != 0
        if (varianceQty !== 0) {
          await tx.stockMovement.create({
            data: {
              brandId: branch.brandId!,
              brandProductId: line.brandProductId,
              type: StockMovementType.ADJUST,
              quantity: Math.abs(varianceQty),
              beforeQty,
              afterQty,
              stockLocationId: location.id,
              note: `ปรับยอดนับสต๊อกกะที่ ${activeShift.roundNumber} (ผลต่าง ${
                varianceQty > 0 ? `+${varianceQty}` : varianceQty
              }${line.varianceReason ? `: ${line.varianceReason}` : ""})`,
              referenceType: "STOCK_SHIFT_AUDIT",
              referenceId: count.id,
              createdByStaffId: session.staffId,
            },
          });
        }
      }

      return count;
    });

    return jsonOk(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

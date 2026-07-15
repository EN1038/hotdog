import { OrderStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { orderGrandTotal } from "@/lib/order-totals";

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId")?.trim() || null;
    const branchId = searchParams.get("branchId")?.trim() || null;
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const take = Math.min(Number(searchParams.get("take") ?? 100) || 100, 200);

    const accessible = getAccessibleBrandIds(session);

    if (accessible !== null) {
      if (accessible.length === 0) {
        return jsonOk({ orders: [], total: 0 });
      }
      if (brandId && !accessible.includes(brandId)) {
        return jsonError("ไม่มีสิทธิ์เข้าถึงแบรนด์นี้", 403);
      }
    }

    // Platform must pick a brand so we don't dump every tenant's customers
    const effectiveBrandId =
      brandId ??
      (accessible !== null && accessible.length === 1 ? accessible[0] : null);

    if (!effectiveBrandId && accessible === null) {
      return jsonOk({
        orders: [],
        total: 0,
        requiresBrand: true,
      });
    }

    const phoneQ = q.replace(/\D/g, "");

    const where = {
      ...(effectiveBrandId
        ? { branch: { brandId: effectiveBrandId } }
        : accessible !== null
          ? { branch: { brandId: { in: accessible } } }
          : {}),
      ...(branchId ? { branchId } : {}),
      ...(status && status in OrderStatus
        ? { status: status as OrderStatus }
        : {}),
      ...(phoneQ
        ? {
            OR: [
              { customerPhone: { contains: phoneQ } },
              { orderNumber: { contains: q, mode: "insensitive" as const } },
              { customerName: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              brandId: true,
              brand: { select: { id: true, name: true, code: true } },
            },
          },
          customer: { select: { id: true, phone: true, name: true } },
          deliveryLocation: { select: { name: true } },
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              optionsPrice: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.order.count({ where }),
    ]);

    return jsonOk({
      requiresBrand: false,
      total,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        fulfillmentType: o.fulfillmentType,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        createdAt: o.createdAt,
        total: orderGrandTotal(
          o.items.map((i) => ({
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            optionsPrice: Number(i.optionsPrice),
          })),
          Number(o.deliveryFee),
          Number(o.discountAmount),
        ),
        branch: o.branch,
        customer: o.customer,
        deliveryLocation: o.deliveryLocation,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { FulfillmentType } from "@prisma/client";
import { requireCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

export type SavedDeliveryAddress = {
  deliveryLocationId: string;
  locationName: string;
  addressDetail: string;
  deliveryFee: string;
  isCustomAddress: boolean;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
};

/** Past delivery addresses for this customer at a branch (most recent unique first). */
export async function GET(request: Request) {
  try {
    const session = await requireCustomer();
    const branchId = new URL(request.url).searchParams.get("branchId")?.trim();
    if (!branchId) return jsonError("ระบุสาขา");

    const orders = await prisma.order.findMany({
      where: {
        customerId: session.customerId!,
        branchId,
        fulfillmentType: FulfillmentType.DELIVERY,
        deliveryLocationId: { not: null },
        addressDetail: { not: null },
      },
      select: {
        addressDetail: true,
        deliveryLatitude: true,
        deliveryLongitude: true,
        createdAt: true,
        deliveryLocation: {
          select: {
            id: true,
            name: true,
            deliveryFee: true,
            isCustomAddress: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });

    const seen = new Set<string>();
    const items: SavedDeliveryAddress[] = [];

    for (const order of orders) {
      const loc = order.deliveryLocation;
      const detail = order.addressDetail?.trim() ?? "";
      if (!loc || !detail) continue;
      const lat = order.deliveryLatitude;
      const lng = order.deliveryLongitude;
      const pinKey =
        lat != null &&
        lng != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
          ? `${lat.toFixed(5)},${lng.toFixed(5)}`
          : "";
      const key = `${loc.id}::${detail.toLowerCase()}::${pinKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        deliveryLocationId: loc.id,
        locationName: loc.name,
        addressDetail: detail,
        deliveryFee: String(loc.deliveryFee),
        isCustomAddress: Boolean(loc.isCustomAddress),
        deliveryLatitude:
          lat != null && Number.isFinite(lat) ? lat : null,
        deliveryLongitude:
          lng != null && Number.isFinite(lng) ? lng : null,
      });
      if (items.length >= 8) break;
    }

    return jsonOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { nominatimReverse, nominatimSearch } from "@/lib/nominatim";

/**
 * Geocode for delivery pins at checkout.
 * No login required — customers often pin before authenticating to place the order.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const latRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng") ?? searchParams.get("lon");
    const q = searchParams.get("q")?.trim() ?? "";

    if (latRaw != null && lngRaw != null) {
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return jsonError("พิกัดไม่ถูกต้อง", 400);
      }
      // Thailand-ish bounds guard (reduce abuse of open proxy)
      if (lat < 5 || lat > 21 || lng < 97 || lng > 106) {
        return jsonError("พิกัดอยู่นอกพื้นที่ที่รองรับ", 400);
      }
      const result = await nominatimReverse(lat, lng);
      if (!result) return jsonError("ไม่พบที่อยู่ใกล้พิกัดนี้", 404);
      return jsonOk(result);
    }

    if (q.length < 2) {
      return jsonError("พิมพ์อย่างน้อย 2 ตัวอักษร หรือระบุ lat/lng", 400);
    }
    if (q.length > 200) {
      return jsonError("ข้อความค้นหายาวเกินไป", 400);
    }

    const results = await nominatimSearch(q);
    return jsonOk({ results });
  } catch (error) {
    return handleApiError(error);
  }
}

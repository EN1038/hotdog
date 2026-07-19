import { requireCustomer } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { nominatimReverse, nominatimSearch } from "@/lib/nominatim";

/** Geocode for logged-in customers (delivery pin on custom zones). */
export async function GET(request: Request) {
  try {
    await requireCustomer();
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
      const result = await nominatimReverse(lat, lng);
      if (!result) return jsonError("ไม่พบที่อยู่ใกล้พิกัดนี้", 404);
      return jsonOk(result);
    }

    if (q.length < 2) {
      return jsonError("พิมพ์อย่างน้อย 2 ตัวอักษร หรือระบุ lat/lng", 400);
    }

    const results = await nominatimSearch(q);
    return jsonOk({ results });
  } catch (error) {
    return handleApiError(error);
  }
}

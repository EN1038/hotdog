import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "HunterDog-Admin/1.0 (branch-location)",
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const latRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng") ?? searchParams.get("lon");
    const q = searchParams.get("q")?.trim() ?? "";

    // Reverse: pin → address
    if (latRaw != null && lngRaw != null) {
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return jsonError("พิกัดไม่ถูกต้อง", 400);
      }

      const url = new URL(NOMINATIM_REVERSE);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
      url.searchParams.set("format", "json");
      url.searchParams.set("accept-language", "th");
      url.searchParams.set("zoom", "18");
      url.searchParams.set("addressdetails", "1");

      const res = await fetch(url.toString(), {
        headers: NOMINATIM_HEADERS,
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        return jsonError("ดึงที่อยู่จากพิกัดไม่สำเร็จ", 502);
      }

      const raw = (await res.json()) as {
        display_name?: string;
        error?: string;
      };
      if (raw.error || !raw.display_name) {
        return jsonError("ไม่พบที่อยู่ใกล้พิกัดนี้", 404);
      }

      return jsonOk({
        address: raw.display_name,
        latitude: lat,
        longitude: lng,
      });
    }

    // Forward search: text → pins
    if (q.length < 2) {
      return jsonError("พิมพ์อย่างน้อย 2 ตัวอักษร หรือระบุ lat/lng", 400);
    }

    const url = new URL(NOMINATIM_SEARCH);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycodes", "th");
    url.searchParams.set("accept-language", "th");

    const res = await fetch(url.toString(), {
      headers: NOMINATIM_HEADERS,
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return jsonError("ค้นหาแผนที่ไม่สำเร็จ ลองใหม่ภายหลัง", 502);
    }

    const raw = (await res.json()) as {
      display_name?: string;
      lat?: string;
      lon?: string;
    }[];

    const results = raw
      .filter((r) => r.lat && r.lon)
      .map((r) => ({
        label: r.display_name ?? "",
        latitude: Number(r.lat),
        longitude: Number(r.lon),
      }))
      .filter(
        (r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude),
      );

    return jsonOk({ results });
  } catch (error) {
    return handleApiError(error);
  }
}

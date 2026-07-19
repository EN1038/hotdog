const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "SkillSale-Order/1.0 (delivery-pin)",
};

export type NominatimSearchHit = {
  label: string;
  latitude: number;
  longitude: number;
};

export async function nominatimReverse(
  lat: number,
  lng: number,
): Promise<{ address: string; latitude: number; longitude: number } | null> {
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
  if (!res.ok) return null;

  const raw = (await res.json()) as {
    display_name?: string;
    error?: string;
  };
  if (raw.error || !raw.display_name) return null;

  return {
    address: raw.display_name,
    latitude: lat,
    longitude: lng,
  };
}

export async function nominatimSearch(
  q: string,
  limit = 6,
): Promise<NominatimSearchHit[]> {
  const url = new URL(NOMINATIM_SEARCH);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "th");
  url.searchParams.set("accept-language", "th");

  const res = await fetch(url.toString(), {
    headers: NOMINATIM_HEADERS,
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];

  const raw = (await res.json()) as {
    display_name?: string;
    lat?: string;
    lon?: string;
  }[];

  return raw
    .filter((r) => r.lat && r.lon)
    .map((r) => ({
      label: r.display_name ?? "",
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    }))
    .filter(
      (r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude),
    );
}

"use client";

const CACHE_PREFIX = "skillsale:package-label-layout:";

export type CachedPackageLabelLayout = {
  brandId: string;
  version: number;
  layout: import("@/lib/print-layout/package-label-layout-types").PackageLabelLayoutDoc;
  fetchedAt: number;
};

function cacheKey(brandId: string) {
  return `${CACHE_PREFIX}${brandId}`;
}

export function readCachedPackageLabelLayout(
  brandId: string,
): CachedPackageLabelLayout | null {
  if (typeof window === "undefined" || !brandId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(brandId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPackageLabelLayout;
    if (!parsed?.layout || typeof parsed.version !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedPackageLabelLayout(
  payload: CachedPackageLabelLayout,
): void {
  if (typeof window === "undefined" || !payload.brandId) return;
  try {
    localStorage.setItem(cacheKey(payload.brandId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export async function fetchPackageLabelLayoutForBrand(
  brandId: string,
): Promise<CachedPackageLabelLayout> {
  const cached = readCachedPackageLabelLayout(brandId);
  const versionQs =
    cached != null ? `?version=${encodeURIComponent(String(cached.version))}` : "";
  const headers: HeadersInit = {};
  if (cached != null) {
    headers["If-None-Match"] = `"package-label-v${cached.version}"`;
  }

  const res = await fetch(`/api/staff/print/layouts/package-label${versionQs}`, {
    cache: "no-store",
    headers,
  });

  if (res.status === 304 && cached) {
    return cached;
  }

  if (!res.ok) {
    throw new Error("โหลดแบบป้ายไม่สำเร็จ");
  }

  const body = await res.json();
  const next: CachedPackageLabelLayout = {
    brandId: String(body.brandId ?? brandId),
    version: Number(body.version ?? 1),
    layout: body.layout,
    fetchedAt: Date.now(),
  };
  writeCachedPackageLabelLayout(next);
  return next;
}

export async function resolveStaffBrandId(): Promise<string | null> {
  try {
    const res = await fetch("/api/staff/branding", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const brandId =
      typeof body.brandId === "string"
        ? body.brandId
        : typeof body.brand?.id === "string"
          ? body.brand.id
          : null;
    return brandId?.trim() || null;
  } catch {
    return null;
  }
}

export type BrandHqSection = "home" | "stock_now" | "restock" | "issue";

export function parseBrandHqSection(
  raw: string | null | undefined,
): BrandHqSection {
  if (raw === "stock_now" || raw === "restock" || raw === "issue") return raw;
  if (raw === "stock") return "stock_now";
  return "home";
}

export function brandHqHref(basePath: string, section: BrandHqSection): string {
  if (section === "home") return basePath;
  return `${basePath}?section=${section}`;
}

/**
 * Base path for brand HQ — scoped to one brand.
 * Platform: `/admin/brands/[id]` · Brand admin (sole brand): `/admin`
 */
export function resolveBrandHqBasePath(
  pathname: string,
  options?: { isPlatformAdmin?: boolean; soleBrandId?: string | null },
): string | null {
  if (/^\/admin\/brands\/[^/]+$/.test(pathname)) {
    return pathname;
  }
  if (
    !options?.isPlatformAdmin &&
    pathname === "/admin" &&
    options?.soleBrandId
  ) {
    return "/admin";
  }
  return null;
}

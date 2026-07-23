/** Public customer app origin, e.g. https://order.skillsale.co */
export function getAppOrigin(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
  ];
  for (const raw of candidates) {
    const value = raw?.trim().replace(/\/$/, "");
    if (value) return value;
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function appAbsoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = getAppOrigin();
  return origin ? `${origin}${normalized}` : normalized;
}

/** Prefer absolute URL; returns null when origin is unknown (avoids bare "/path" links). */
export function appAbsoluteUrlOrNull(path: string): string | null {
  const origin = getAppOrigin();
  if (!origin) return null;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

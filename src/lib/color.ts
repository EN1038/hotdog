/** Parse #RGB / #RRGGBB to components */
export function parseHexColor(input: string | null | undefined): {
  r: number;
  g: number;
  b: number;
  hex: string;
} | null {
  if (!input) return null;
  let hex = input.trim();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    hex: hex.toLowerCase(),
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function rgba(hex: string, alpha: number): string {
  const c = parseHexColor(hex);
  if (!c) return `rgba(100, 116, 139, ${alpha})`;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

export const DEFAULT_BRAND_COLOR = "#dc2626";

export const BRAND_COLOR_PRESETS = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#059669",
  "#0284c7",
  "#7c3aed",
  "#db2777",
  "#334155",
] as const;

export function normalizePrimaryColor(
  input: string | null | undefined,
  fallback: string,
): string {
  return parseHexColor(input)?.hex ?? parseHexColor(fallback)?.hex ?? fallback;
}

export function brandColorFromApi(
  color: string | null | undefined,
): string {
  return normalizePrimaryColor(color, DEFAULT_BRAND_COLOR);
}

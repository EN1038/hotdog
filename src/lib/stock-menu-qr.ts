import { appAbsoluteUrlOrNull } from "@/lib/app-url";
import { barcodeDigitsOnly } from "@/lib/stock-barcode-format";

/** QR on menu/product stickers — scan to start package-in for that item. */
export function stockMenuQrPayload(input: {
  itemId?: string | null;
  productCode?: string | null;
}): string {
  const itemId = input.itemId?.trim() ?? "";
  const code = barcodeDigitsOnly(input.productCode ?? "");

  if (itemId) {
    const url = appAbsoluteUrlOrNull(
      `/staff/stock/package-in?item=${encodeURIComponent(itemId)}`,
    );
    if (url) return url;
    return code
      ? `skillsale:menu:${itemId}:${code}`
      : `skillsale:menu:${itemId}`;
  }

  if (!code) return "";

  const url = appAbsoluteUrlOrNull(
    `/staff/stock/package-in?code=${encodeURIComponent(code)}`,
  );
  if (url) return url;
  return `skillsale:product:${code}`;
}

export function parseStockMenuQrPayload(
  raw: string,
): { itemId?: string; productCode: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const itemId = url.searchParams.get("item")?.trim();
      const code = url.searchParams.get("code")?.trim();
      if (itemId) {
        return {
          itemId,
          productCode: code ? barcodeDigitsOnly(code) : "",
        };
      }
      if (code) {
        return { productCode: barcodeDigitsOnly(code) };
      }
    }
  } catch {
    /* not a URL */
  }

  const menuMatch = /^skillsale:menu:([^:]+):(\d+)$/.exec(trimmed);
  if (menuMatch) {
    return { itemId: menuMatch[1], productCode: menuMatch[2] };
  }

  const menuOnly = /^skillsale:menu:([^:]+)$/.exec(trimmed);
  if (menuOnly) {
    return { itemId: menuOnly[1], productCode: "" };
  }

  const productMatch = /^skillsale:product:(\d+)$/.exec(trimmed);
  if (productMatch) {
    return { productCode: productMatch[1] };
  }

  return null;
}

export function isStockMenuQrPayload(raw: string): boolean {
  return parseStockMenuQrPayload(raw) != null;
}

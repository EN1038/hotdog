import { isStockLabelQrPayload } from "@/lib/stock-label-qr";
import { isStockMenuQrPayload } from "@/lib/stock-menu-qr";

export type StockMenuScanMatch = {
  itemId: string;
  name: string;
  productCode: string;
};

export function buildMenuLookupQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isStockMenuQrPayload(trimmed)) {
    return `qr=${encodeURIComponent(trimmed)}`;
  }
  return `code=${encodeURIComponent(trimmed)}`;
}

/** Resolve menu / stock item from QR payload or typed product code. */
export async function lookupStockMenuScan(
  raw: string,
): Promise<StockMenuScanMatch> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("กรุณากรอกรหัสสินค้าหรือสแกน QR");
  }
  if (isStockLabelQrPayload(trimmed)) {
    throw new Error("นี่คือ QR ป้ายรายการ — ใช้เมนูจ่ายออกรายการ");
  }

  const query = buildMenuLookupQuery(trimmed);
  if (!query) {
    throw new Error("กรุณากรอกรหัสสินค้าหรือสแกน QR");
  }

  const res = await fetch(`/api/staff/stock/menu-lookup?${query}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "ไม่พบรหัสสินค้าในสาขานี้",
    );
  }

  const itemId = String(body.itemId ?? "");
  const name = String(body.name ?? "สินค้า");
  const productCode = String(body.productCode ?? "");
  if (!itemId) throw new Error("ไม่พบรหัสสินค้าในสาขานี้");

  return { itemId, name, productCode };
}

/** รูปประกอบการจ่ายออก — เก็บใน StockMovement.imageUrl เป็น URL เดียว หรือ JSON array */

export const MAX_STOCK_MOVEMENT_IMAGES = 30;

export function parseMovementImages(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const text = raw.trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, MAX_STOCK_MOVEMENT_IMAGES);
      }
    } catch {
      /* ใช้เป็น URL เดี่ยว */
    }
  }
  return [text];
}

export function encodeMovementImages(urls: string[]): string | null {
  const clean = urls.map((u) => u.trim()).filter(Boolean).slice(0, MAX_STOCK_MOVEMENT_IMAGES);
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0]!;
  return JSON.stringify(clean);
}

/** รวมรูปจากหลายแถวประวัติในบิลเดียวกัน (ไม่ซ้ำ) */
export function mergeMovementImageUrls(
  rawList: Array<string | null | undefined>,
): string | null {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    for (const url of parseMovementImages(raw)) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= MAX_STOCK_MOVEMENT_IMAGES) {
        return encodeMovementImages(urls);
      }
    }
  }
  return encodeMovementImages(urls);
}

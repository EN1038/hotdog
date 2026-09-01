/** Client-safe LOT day prefix from YYYY-MM-DD → YYMMDD */
export function lotDayPrefix(producedAt: string): string {
  const [y, m, d] = producedAt.split("-");
  if (!y || !m || !d) return "------";
  return `${y.slice(-2)}${m}${d}`;
}

/** Preview LOT before save — running number assigned on submit */
export function formatLotPreview(producedAt: string): string {
  return `${lotDayPrefix(producedAt)}-????`;
}

export function formatThaiDateKey(dateKey: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(`${dateKey}T12:00:00+07:00`));
  } catch {
    return dateKey;
  }
}

/** Client-safe LOT day prefix from YYYY-MM-DD → YYMMDD */
export function lotDayPrefix(producedAt: string): string {
  const [y, m, d] = producedAt.split("-");
  if (!y || !m || !d) return "------";
  return `${y.slice(-2)}${m}${d}`;
}

/** Full LOT string e.g. 260901-0003 */
export function formatLotNumber(producedAt: string, sequence: number): string {
  return `${lotDayPrefix(producedAt)}-${String(sequence).padStart(4, "0")}`;
}

/** Plan sequential LOT numbers for unsaved pack rows (same order as submit). */
export function planLotNumbersForRows(
  rows: Array<{ producedAt: string }>,
  baseCountsByDay: Record<string, number>,
): string[] {
  const dayOffset = new Map<string, number>();
  return rows.map((row) => {
    const day = row.producedAt;
    const base = baseCountsByDay[day] ?? 0;
    const offset = dayOffset.get(day) ?? 0;
    dayOffset.set(day, offset + 1);
    return formatLotNumber(day, base + offset + 1);
  });
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

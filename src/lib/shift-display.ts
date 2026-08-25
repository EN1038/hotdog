/** Bangkok wall-clock time from ISO (HH:mm). */
export function formatBangkokShiftTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Elapsed since openedAt — `m:ss` or `h:mm:ss`. */
export function formatShiftElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function shiftElapsedMs(openedAt: string, nowMs = Date.now()): number {
  const start = new Date(openedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, nowMs - start);
}

/** Bangkok date + time for shift close/open labels. */
export function formatBangkokShiftDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
    const time = formatBangkokShiftTime(iso);
    return time ? `${date} ${time} น.` : date;
  } catch {
    return "";
  }
}

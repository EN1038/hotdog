/** Client-safe queue display helpers (no DB imports). */

export function formatQueueNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.trunc(n));
}

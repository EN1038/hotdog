/** User-facing label for package-in stock movements (menu name). */
export const PACKAGE_IN_MOVEMENT_NOTE = "รับเข้าและพิมพ์บาร์โค้ด + QR";

const LEGACY_PACKAGE_IN_NOTES = new Set([
  "รับเข้าแพ็ค",
  "รับเข้าแพ็ก",
  "รับเข้ารายการ",
]);

/** Normalize legacy package-in notes for display in history. */
export function formatStockMovementNoteDisplay(
  note: string | null | undefined,
): string {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) return "—";
  if (LEGACY_PACKAGE_IN_NOTES.has(trimmed)) {
    return PACKAGE_IN_MOVEMENT_NOTE;
  }
  return trimmed;
}

/** Stock movement from «รับเข้าและพิมพ์บาร์โค้ด + QR» — has printable labels. */
export function isPackageInMovementNote(
  note: string | null | undefined,
): boolean {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) return false;
  return (
    trimmed === PACKAGE_IN_MOVEMENT_NOTE || LEGACY_PACKAGE_IN_NOTES.has(trimmed)
  );
}

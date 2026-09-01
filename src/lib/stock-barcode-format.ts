/** Barcode on printed labels — digits only (Code128 numeric-friendly). */
export function barcodeDigitsOnly(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits || trimmed;
}

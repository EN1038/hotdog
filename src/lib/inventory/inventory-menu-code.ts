/** Resolve display / print code for branch menu items. */
export function resolveMenuItemProductCode(input: {
  id: string;
  itemCode?: string | null;
}): string {
  const manual = input.itemCode?.trim();
  if (manual) return manual;

  return input.id.slice(-8).toUpperCase();
}

export function isManualMenuItemCode(input: {
  itemCode?: string | null;
}): boolean {
  return Boolean(input.itemCode?.trim());
}

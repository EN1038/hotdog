type NoteLine = {
  menuItemId?: string;
  nonMenuItemId?: string;
  name: string;
  systemQty: number;
  countedQty: number;
};

type NotePayload = {
  stockType?: string;
  pendingAdminApply?: boolean;
  appliedAt?: string;
  appliedByAdminId?: string;
  appliedByStaffId?: string;
  lines?: NoteLine[];
};

export function parseStockSummaryNote(raw: string | null): NotePayload {
  if (!raw?.startsWith("{")) return {};
  try {
    return JSON.parse(raw) as NotePayload;
  } catch {
    return {};
  }
}

/** Staff auto-applied consumable/equipment summaries (before convert flow). */
export function isAutoAppliedNonSaleSummary(
  status: string,
  noteRaw: string | null,
): boolean {
  if (status !== "COMPLETED") return false;
  const note = parseStockSummaryNote(noteRaw);
  const stockType = note.stockType;
  if (stockType !== "CONSUMABLE" && stockType !== "EQUIPMENT") return false;
  if (note.appliedAt || note.appliedByAdminId || note.appliedByStaffId) {
    return false;
  }
  return true;
}

import { BranchTomorrowPlanStatus } from "@prisma/client";

/** Input shape for last-write-wins merge across confirmed rounds. */
export type TomorrowPlanMergeRoundLine = {
  menuItemId: string;
  confirmedQty: number;
  suggestedQty: number;
  parStock: number;
  availableStock: number;
  confirmedAt?: string;
  productCode?: string;
  name?: string;
  category?: string | null;
  imageUrl?: string | null;
  id?: string;
  hasManualItemCode?: boolean;
};

export type TomorrowPlanMergeRound = {
  roundNo: number;
  status: BranchTomorrowPlanStatus | string;
  confirmedAt: string;
  lines: TomorrowPlanMergeRoundLine[];
};

export type TomorrowPlanEffectiveLine = TomorrowPlanMergeRoundLine & {
  lastRoundNo: number;
};

export type TomorrowPlanQtyDiff = {
  menuItemId: string;
  productCode: string;
  name: string;
  fromQty: number;
  toQty: number;
  fromRound: number;
  toRound: number;
};

/**
 * Merge confirmed rounds in ascending round order.
 * Later rounds overwrite only menu items they include; untouched items keep prior qty.
 */
export function mergeTomorrowPlanRounds(
  rounds: TomorrowPlanMergeRound[],
): {
  effectiveLines: TomorrowPlanEffectiveLine[];
  diffs: TomorrowPlanQtyDiff[];
} {
  const confirmed = [...rounds]
    .filter((r) => r.status === "CONFIRMED")
    .sort(
      (a, b) =>
        a.roundNo - b.roundNo || a.confirmedAt.localeCompare(b.confirmedAt),
    );

  const byMenu = new Map<string, TomorrowPlanEffectiveLine>();
  const diffs: TomorrowPlanQtyDiff[] = [];

  for (const round of confirmed) {
    for (const line of round.lines) {
      const prev = byMenu.get(line.menuItemId);
      if (prev && prev.confirmedQty !== line.confirmedQty) {
        diffs.push({
          menuItemId: line.menuItemId,
          productCode: line.productCode ?? prev.productCode ?? "",
          name: line.name ?? prev.name ?? "",
          fromQty: prev.confirmedQty,
          toQty: line.confirmedQty,
          fromRound: prev.lastRoundNo,
          toRound: round.roundNo,
        });
      }
      byMenu.set(line.menuItemId, {
        ...line,
        lastRoundNo: round.roundNo,
      });
    }
  }

  return {
    effectiveLines: [...byMenu.values()],
    diffs,
  };
}

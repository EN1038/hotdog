"use client";

import type { ReactNode } from "react";
import {
  SKEWER_CATEGORY_ROLE_LABELS,
  formatSkewerSplitSummary,
  summarizeSkewerSplit,
  type SkewerCategoryRoleValue,
} from "@/lib/skewer-order";

type LineLike = {
  quantity: number;
  ordered?: boolean;
  sticksPerUnit?: number | null;
  countsAsSticks?: boolean | null;
  skewerCategoryRole?: string | null;
};

type Props<T extends LineLike> = {
  lines: T[];
  renderLine: (line: T, index: number) => ReactNode;
  saleTitle?: string;
  supplyTitle?: string;
  listClassName?: string;
  emptySale?: ReactNode;
  emptySupply?: ReactNode;
  showSummary?: boolean;
  summaryClassName?: string;
};

export function splitLinesBySkewerRole<T extends { skewerCategoryRole?: string | null }>(
  lines: T[],
) {
  const saleLines: T[] = [];
  const supplyLines: T[] = [];
  for (const line of lines) {
    if (line.skewerCategoryRole === "SKEWER_SUPPLY") supplyLines.push(line);
    else saleLines.push(line);
  }
  return { saleLines, supplyLines };
}

export function SkewerSplitOrderSections<T extends LineLike>({
  lines,
  renderLine,
  saleTitle = SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SALE,
  supplyTitle = SKEWER_CATEGORY_ROLE_LABELS.SKEWER_SUPPLY,
  listClassName = "divide-y divide-gray-100 rounded-xl border border-gray-200",
  emptySale = null,
  emptySupply = null,
  showSummary = false,
  summaryClassName = "text-xs text-gray-500",
}: Props<T>) {
  const { saleLines, supplyLines } = splitLinesBySkewerRole(lines);
  const splitSummary = showSummary ? summarizeSkewerSplit(lines) : null;

  return (
    <div className="space-y-4">
      {showSummary && splitSummary ? (
        <p className={summaryClassName}>
          {formatSkewerSplitSummary({
            sale: splitSummary.sale,
            supplyItemCount: splitSummary.supplyItemCount,
          })}
        </p>
      ) : null}

      {(saleLines.length > 0 || emptySale) && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">{saleTitle}</p>
          {saleLines.length > 0 ? (
            <ul className={listClassName}>
              {saleLines.map((line, i) => (
                <li key={i}>{renderLine(line, i)}</li>
              ))}
            </ul>
          ) : (
            emptySale
          )}
        </div>
      )}

      {(supplyLines.length > 0 || emptySupply) && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">{supplyTitle}</p>
          {supplyLines.length > 0 ? (
            <ul className={listClassName}>
              {supplyLines.map((line, i) => (
                <li key={i}>{renderLine(line, i)}</li>
              ))}
            </ul>
          ) : (
            emptySupply
          )}
        </div>
      )}
    </div>
  );
}

export function skewerRoleFromValue(
  role?: string | null,
): SkewerCategoryRoleValue {
  return role === "SKEWER_SUPPLY" ? "SKEWER_SUPPLY" : "SKEWER_SALE";
}

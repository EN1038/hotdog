import { TableSessionLineKind } from "@prisma/client";

export function computeSessionLineTotal(input: {
  kind: TableSessionLineKind;
  quantity: number;
  weightKg: number | null;
  unitPrice: number;
}): number {
  if (input.kind === "WEIGHT") {
    const kg = input.weightKg ?? 0;
    return Math.round(kg * input.unitPrice * 100) / 100;
  }
  return Math.round(input.quantity * input.unitPrice * 100) / 100;
}

export function sumSessionLines(
  lines: { lineTotal: { toString(): string } | number | string }[],
): number {
  let sum = 0;
  for (const line of lines) {
    sum += Number(line.lineTotal);
  }
  return Math.round(sum * 100) / 100;
}

export function sessionGrandTotal(
  lines: { lineTotal: { toString(): string } | number | string }[],
  discountAmount: number,
): number {
  const items = sumSessionLines(lines);
  return Math.max(0, Math.round((items - discountAmount) * 100) / 100);
}

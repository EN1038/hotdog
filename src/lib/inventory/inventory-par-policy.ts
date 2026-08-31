import { INVENTORY_DEFAULTS } from "@/lib/inventory/inventory-config";
import type { StockRecommendGrade } from "@/lib/stock-recommendation-shared";

export type SkewerParPolicy = {
  eligibleGrades: StockRecommendGrade[];
  gradeMax: { A: number; B: number; C: number };
  branchParMin: number;
  branchParMax: number;
  branchParFactor: number;
  /** Days of average sales to hold (1, 2, or custom). */
  holdDays: number;
  /** Same as holdDays — days of that SKU's average sales */
  itemParFactor: number;
  /** Cap as days of sales (1-day mode uses 1.5 so it stays under 2) */
  maxDaysOnHand: number;
};

export const PAR_HOLD_DAYS_MIN = 1;
export const PAR_HOLD_DAYS_MAX = 7;

export function clampParHoldDays(raw: number): number {
  if (!Number.isFinite(raw) || raw < PAR_HOLD_DAYS_MIN) return 1;
  return Math.min(PAR_HOLD_DAYS_MAX, Math.round(raw));
}

export function factorsForHoldDays(holdDays: number): Pick<
  SkewerParPolicy,
  | "holdDays"
  | "itemParFactor"
  | "branchParFactor"
  | "maxDaysOnHand"
  | "branchParMin"
  | "branchParMax"
> {
  const days = clampParHoldDays(holdDays);
  return {
    holdDays: days,
    itemParFactor: days,
    branchParFactor: days,
    maxDaysOnHand:
      days <= 1 ? INVENTORY_DEFAULTS.skewerMaxDaysOnHand : days,
    branchParMin: Math.round(INVENTORY_DEFAULTS.skewerTotalParMin * days),
    branchParMax: Math.round(INVENTORY_DEFAULTS.skewerTotalParMax * days),
  };
}

export const DEFAULT_SKEWER_PAR_POLICY: SkewerParPolicy = {
  eligibleGrades: ["A", "B"],
  gradeMax: { A: 35, B: 12, C: 0 },
  ...factorsForHoldDays(1),
};

function parseEligibleGrades(raw: string | null | undefined): StockRecommendGrade[] {
  const token = (raw ?? "AB").trim().toUpperCase();
  if (token === "A") return ["A"];
  if (token === "ABC" || token === "AB_C" || token === "ALL") return ["A", "B", "C"];
  return ["A", "B"];
}

function parsePositiveInt(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function parseHoldDays(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === "") return 1;
  const n = Number.parseFloat(raw);
  return clampParHoldDays(n);
}

export function parseSkewerParPolicyFromSearchParams(
  searchParams: URLSearchParams,
): SkewerParPolicy {
  const holdDays = parseHoldDays(
    searchParams.get("holdDays") ?? searchParams.get("itemParFactor"),
  );
  const derived = factorsForHoldDays(holdDays);
  return {
    eligibleGrades: parseEligibleGrades(searchParams.get("parGrades")),
    gradeMax: {
      A: parsePositiveInt(searchParams.get("maxA"), DEFAULT_SKEWER_PAR_POLICY.gradeMax.A),
      B: parsePositiveInt(searchParams.get("maxB"), DEFAULT_SKEWER_PAR_POLICY.gradeMax.B),
      C: parsePositiveInt(searchParams.get("maxC"), DEFAULT_SKEWER_PAR_POLICY.gradeMax.C),
    },
    branchParMin: parsePositiveInt(
      searchParams.get("branchParMin"),
      derived.branchParMin,
    ),
    branchParMax: parsePositiveInt(
      searchParams.get("branchParMax"),
      derived.branchParMax,
    ),
    branchParFactor: derived.branchParFactor,
    holdDays: derived.holdDays,
    itemParFactor: derived.itemParFactor,
    maxDaysOnHand: derived.maxDaysOnHand,
  };
}

export function skewerParPolicyToSearchParams(
  policy: SkewerParPolicy,
): URLSearchParams {
  const grades =
    policy.eligibleGrades.length === 1 && policy.eligibleGrades[0] === "A"
      ? "A"
      : policy.eligibleGrades.includes("C")
        ? "ABC"
        : "AB";
  const holdDays = clampParHoldDays(policy.holdDays ?? policy.itemParFactor ?? 1);
  const params = new URLSearchParams({
    parGrades: grades,
    maxA: String(policy.gradeMax.A),
    maxB: String(policy.gradeMax.B),
    maxC: String(policy.gradeMax.C),
    branchParMin: String(policy.branchParMin),
    branchParMax: String(policy.branchParMax),
    holdDays: String(holdDays),
  });
  return params;
}

export function isParEligibleGrade(
  grade: StockRecommendGrade,
  policy: SkewerParPolicy,
): boolean {
  return policy.eligibleGrades.includes(grade);
}

export type SkewerParPolicyBody = {
  parGrades?: string;
  maxA?: number;
  maxB?: number;
  maxC?: number;
  branchParMin?: number;
  branchParMax?: number;
  holdDays?: number;
};

export function skewerParPolicyFromBody(body: SkewerParPolicyBody): SkewerParPolicy {
  const params = new URLSearchParams();
  if (body.parGrades) params.set("parGrades", body.parGrades);
  if (body.maxA != null) params.set("maxA", String(body.maxA));
  if (body.maxB != null) params.set("maxB", String(body.maxB));
  if (body.maxC != null) params.set("maxC", String(body.maxC));
  if (body.branchParMin != null) params.set("branchParMin", String(body.branchParMin));
  if (body.branchParMax != null) params.set("branchParMax", String(body.branchParMax));
  if (body.holdDays != null) params.set("holdDays", String(body.holdDays));
  return parseSkewerParPolicyFromSearchParams(params);
}

import { prisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

type PlanHeaderDb = PrismaClient["branchTomorrowPlan"];
type PlanLineDb = PrismaClient["branchTomorrowPlanLine"];

/** Prisma 7 + HMR: model delegates may be missing on a stale singleton. */
export function getTomorrowPlanLineDb(): PlanLineDb | null {
  const line = (prisma as unknown as Record<string, unknown>)
    .branchTomorrowPlanLine as PlanLineDb | undefined;
  return line?.findMany ? line : null;
}

export function getTomorrowPlanHeaderDb(): PlanHeaderDb | null {
  const header = (prisma as unknown as Record<string, unknown>)
    .branchTomorrowPlan as PlanHeaderDb | undefined;
  return header?.findMany ? header : null;
}

export function legacyPlanId(branchId: string, planDate: string): string {
  return `legacy:${branchId}:${planDate}`;
}

export function parseLegacyPlanId(
  planId: string,
): { branchId: string; planDate: string } | null {
  const m = planId.match(/^legacy:([^:]+):(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  return { branchId: m[1]!, planDate: m[2]! };
}

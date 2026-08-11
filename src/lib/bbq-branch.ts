import { BranchOperatingMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";

type BbqBranch = {
  id: string;
  name: string;
  operatingMode: BranchOperatingMode;
  code: string | null;
  brand: { code: string } | null;
};

export async function requireBbqWeighBranch(
  branchId: string,
): Promise<{ branch: BbqBranch } | { error: Response }> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      operatingMode: true,
      brand: { select: { code: true } },
      code: true,
    },
  });
  if (!branch) return { error: jsonError("ไม่พบสาขา", 404) };
  if (branch.operatingMode !== BranchOperatingMode.BBQ_WEIGH) {
    return { error: jsonError("สาขานี้ไม่ใช่โหมดหมูกระทะชั่งกิโล", 400) };
  }
  return { branch };
}

export function isBbqGateError(
  gate: { branch: BbqBranch } | { error: Response },
): gate is { error: Response } {
  return "error" in gate;
}

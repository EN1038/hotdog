import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AdminActivityAction } from "@/lib/admin-activity-shared";

export type {
  AdminActivityAction,
} from "@/lib/admin-activity-shared";
export {
  ADMIN_ACTIVITY_ACTIONS,
  ADMIN_ACTIVITY_ACTION_OPTIONS,
  activityActionLabel,
  summarizeBranchPatch,
} from "@/lib/admin-activity-shared";

export type LogAdminActivityInput = {
  action: AdminActivityAction;
  summary: string;
  brandId?: string | null;
  brandName?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Persist an admin mutation for audit; never throws to callers. */
export async function logAdminActivity(
  session: SessionPayload,
  input: LogAdminActivityInput,
): Promise<void> {
  try {
    await prisma.adminActivityLog.create({
      data: {
        adminId: session.adminId ?? null,
        adminUsername: session.username?.trim() || "unknown",
        action: input.action,
        summary: input.summary.slice(0, 500),
        brandId: input.brandId ?? null,
        brandName: input.brandName?.slice(0, 200) ?? null,
        branchId: input.branchId ?? null,
        branchName: input.branchName?.slice(0, 200) ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        entityName: input.entityName?.slice(0, 200) ?? null,
        metadata:
          input.metadata == null
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    console.error("[admin-activity] failed to write log", error);
  }
}

export async function getBranchActivityContext(branchId: string) {
  return prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      brandId: true,
      brand: { select: { id: true, name: true } },
    },
  });
}

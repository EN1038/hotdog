import type { SessionPayload } from "@/lib/auth";
import {
  logAdminActivity,
  type AdminActivityAction,
  type LogAdminActivityInput,
} from "@/lib/admin-activity";
import { prisma } from "@/lib/db";

type LineAdminForLog = {
  id: string;
  username: string;
  isPlatformAdmin: boolean;
  brandMembers: Array<{
    role: string;
    brandId: string;
    brand?: { name: string } | null;
  }>;
};

export function sessionFromLineAdmin(admin: LineAdminForLog): SessionPayload {
  const brandIds = [
    ...new Set(
      admin.brandMembers
        .filter((m) => m.role === "OWNER" || m.role === "MANAGER")
        .map((m) => m.brandId),
    ),
  ];
  return {
    type: "admin",
    adminId: admin.id,
    username: admin.username,
    isPlatformAdmin: admin.isPlatformAdmin,
    brandIds,
  };
}

/** Activity log for LINE OA commands; never throws. */
export async function logLineAdminActivity(
  admin: LineAdminForLog,
  input: {
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
  },
): Promise<void> {
  let brandId = input.brandId ?? null;
  let brandName = input.brandName ?? null;

  if (!brandId) {
    const first = admin.brandMembers.find(
      (m) => m.role === "OWNER" || m.role === "MANAGER",
    );
    if (first) {
      brandId = first.brandId;
      if (!brandName) {
        brandName =
          first.brand?.name ??
          (
            await prisma.brand.findUnique({
              where: { id: first.brandId },
              select: { name: true },
            })
          )?.name ??
          null;
      }
    }
  }

  const payload: LogAdminActivityInput = {
    action: input.action,
    summary: input.summary,
    brandId,
    brandName,
    branchId: input.branchId ?? null,
    branchName: input.branchName ?? null,
    entityType: input.entityType ?? "line",
    entityId: input.entityId ?? admin.id,
    entityName: input.entityName ?? admin.username,
    metadata: {
      via: "line",
      ...(input.metadata ?? {}),
    },
  };

  await logAdminActivity(sessionFromLineAdmin(admin), payload);
}

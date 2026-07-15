import { requireAdmin, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";

export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** null = all brands (platform admin) */
export function getAccessibleBrandIds(
  session: SessionPayload,
): string[] | null {
  if (session.isPlatformAdmin) return null;
  return session.brandIds ?? [];
}

export function canAccessBrand(
  session: SessionPayload,
  brandId: string | null | undefined,
): boolean {
  if (session.isPlatformAdmin) return true;
  if (!brandId) return false;
  return (session.brandIds ?? []).includes(brandId);
}

export async function requirePlatformAdmin() {
  const session = await requireAdmin();
  if (!session.isPlatformAdmin) {
    throw new ForbiddenError("ต้องเป็นผู้ดูแลแพลตฟอร์ม");
  }
  return session;
}

export async function assertBrandAccess(
  session: SessionPayload,
  brandId: string | null | undefined,
) {
  if (!canAccessBrand(session, brandId)) {
    throw new ForbiddenError("ไม่มีสิทธิ์เข้าถึงแบรนด์นี้");
  }
}

export async function assertBranchAccess(
  session: SessionPayload,
  branchId: string,
) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, brandId: true },
  });
  if (!branch) {
    throw new Error("NOT_FOUND");
  }
  if (!canAccessBrand(session, branch.brandId)) {
    throw new ForbiddenError("ไม่มีสิทธิ์เข้าถึงสาขานี้");
  }
  return branch;
}

export async function requireBranchAccess(branchId: string) {
  const session = await requireAdmin();
  const branch = await assertBranchAccess(session, branchId);
  return { session, branch };
}

export async function requireBrandAccess(brandId: string) {
  const session = await requireAdmin();
  await assertBrandAccess(session, brandId);
  return session;
}

export function brandScopeWhere(session: SessionPayload):
  | { brandId: { in: string[] } }
  | Record<string, never> {
  const ids = getAccessibleBrandIds(session);
  if (ids === null) return {};
  return { brandId: { in: ids } };
}

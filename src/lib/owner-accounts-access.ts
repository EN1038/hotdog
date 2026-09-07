import { requireAdmin, type SessionPayload } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";

export class OwnerAccountsAccessError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message);
    this.name = "OwnerAccountsAccessError";
    this.status = status;
    this.body = body;
  }
}

/** Owner (non-platform) session + brand ids they can access. */
export async function requireOwnerSession(): Promise<{
  session: SessionPayload;
  brandIds: string[];
}> {
  const session = await requireAdmin();
  if (session.isPlatformAdmin) {
    throw new OwnerAccountsAccessError("หน้านี้สำหรับเจ้าของร้าน", 403, {
      redirect: "/admin",
    });
  }
  const brandIds = getAccessibleBrandIds(session) ?? [];
  if (brandIds.length === 0) {
    throw new OwnerAccountsAccessError("บัญชีนี้ยังไม่ได้ผูกกับร้าน", 403);
  }
  return { session, brandIds };
}

/** Ensure branchId belongs to an accessible brand; return branch + brandId. */
export async function requireOwnerBranch(
  session: SessionPayload,
  brandIds: string[],
  branchId: string | null | undefined,
) {
  const id = branchId?.trim();
  if (!id) {
    throw new OwnerAccountsAccessError("กรุณาระบุสาขา", 400);
  }
  const branch = await prisma.branch.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      brandId: true,
      kind: true,
      isHidden: true,
      isTest: true,
      brand: { select: { id: true, name: true, code: true } },
    },
  });
  if (!branch || !branch.brandId || !brandIds.includes(branch.brandId)) {
    throw new OwnerAccountsAccessError("ไม่พบสาขาหรือไม่มีสิทธิ์", 404);
  }
  return branch;
}

export function ownerAccessErrorResponse(error: unknown) {
  if (error instanceof OwnerAccountsAccessError) {
    return jsonError(error.message, error.status, error.body);
  }
  return null;
}

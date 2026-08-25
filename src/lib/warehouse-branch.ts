import { BranchKind, StockLocationType, WarehouseIssueMode } from "@prisma/client";
import { ForbiddenError } from "@/lib/admin-access";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { slugifyCode, withUniqueSuffix } from "@/lib/slug";

export const WAREHOUSE_DEFAULT_NAME = "สต๊อกกลาง";

export type WarehouseBranchRow = {
  id: string;
  name: string;
  kind: BranchKind;
  warehouseIssueMode: WarehouseIssueMode;
  warehouseAllowedBranchIds: string[];
  stockEnabled: boolean;
};

export function isWarehouseBranch(branch: {
  kind?: BranchKind | string | null;
}): boolean {
  return branch.kind === "WAREHOUSE";
}

export function storeBranchWhere() {
  return { kind: "STORE" as const };
}

/** Staff logged into the brand's สต๊อกกลาง branch */
export async function requireWarehouseStaff() {
  const session = await requireStaff();
  let branch: {
    id: string;
    kind: BranchKind | string | null;
    brandId: string | null;
    name: string;
  } | null;
  try {
    branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, kind: true, brandId: true, name: true },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/kind|Unknown field|column/i.test(msg)) throw e;
    const fallback = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, brandId: true, name: true },
    });
    branch = fallback ? { ...fallback, kind: "STORE" } : null;
  }
  if (!branch?.brandId || branch.kind !== "WAREHOUSE") {
    throw new ForbiddenError("หน้านี้สำหรับพนักงานสต๊อกกลาง");
  }
  return { session, branch, brandId: branch.brandId };
}

export function warehouseCanSendToBranch(
  warehouse: { warehouseAllowedBranchIds?: string[] | null },
  storeBranchId: string,
): boolean {
  const allowed = warehouse.warehouseAllowedBranchIds ?? [];
  if (allowed.length === 0) return true;
  return allowed.includes(storeBranchId);
}

async function uniqueWarehouseCode(brandId: string) {
  const existing = await prisma.branch.findMany({
    where: { brandId },
    select: { code: true },
  });
  const taken = new Set(
    existing.map((b) => b.code).filter((c): c is string => Boolean(c)),
  );
  return withUniqueSuffix(slugifyCode("stock-center") || "stock-center", taken);
}

/** Create or return the brand's สต๊อกกลาง branch + warehouse location. */
export async function ensureWarehouseBranch(brandId: string) {
  const existing = await prisma.branch.findFirst({
    where: { brandId, kind: BranchKind.WAREHOUSE },
  });
  if (existing) {
    await prisma.branch.update({
      where: { id: existing.id },
      data: { stockEnabled: true, isHidden: true, isTest: false },
    });
    await linkWarehouseLocation(brandId, existing.id, existing.name);
    return prisma.branch.findUniqueOrThrow({ where: { id: existing.id } });
  }

  const code = await uniqueWarehouseCode(brandId);
  const created = await prisma.branch.create({
    data: {
      brandId,
      name: WAREHOUSE_DEFAULT_NAME,
      code,
      isHidden: true,
      isOpen: true,
      isTest: false,
      stockEnabled: true,
      kind: BranchKind.WAREHOUSE,
      warehouseIssueMode: WarehouseIssueMode.TRANSFER,
      allowAdvanceOrder: false,
      autoAcceptOrders: false,
    },
  });
  await linkWarehouseLocation(brandId, created.id, created.name);
  return created;
}

async function linkWarehouseLocation(
  brandId: string,
  warehouseBranchId: string,
  name: string,
) {
  const byBranch = await prisma.stockLocation.findFirst({
    where: { branchId: warehouseBranchId },
  });
  if (byBranch) {
    if (byBranch.type !== StockLocationType.WAREHOUSE || byBranch.name !== name) {
      await prisma.stockLocation.update({
        where: { id: byBranch.id },
        data: { type: StockLocationType.WAREHOUSE, name },
      });
    }
    return byBranch;
  }

  const orphan = await prisma.stockLocation.findFirst({
    where: { brandId, type: StockLocationType.WAREHOUSE, branchId: null },
  });
  if (orphan) {
    return prisma.stockLocation.update({
      where: { id: orphan.id },
      data: { branchId: warehouseBranchId, name },
    });
  }

  return prisma.stockLocation.create({
    data: {
      brandId,
      branchId: warehouseBranchId,
      type: StockLocationType.WAREHOUSE,
      name,
    },
  });
}

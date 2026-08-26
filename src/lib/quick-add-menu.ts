import { prisma } from "@/lib/db";
import {
  defaultQuickAddPrice,
  type QuickAddMenuCommand,
  type QuickAddMenuScope,
} from "@/lib/quick-add-menu-parse";
import { isTestBranch } from "@/lib/branch-test";

export type QuickAddBranchResult = {
  branchId: string;
  branchName: string;
  status: "created" | "skipped" | "error";
  menuItemId?: string;
  message?: string;
};

export type QuickAddMenuResult = {
  name: string;
  price: number;
  categoryHint: string | null;
  results: QuickAddBranchResult[];
  created: number;
  skipped: number;
  errors: number;
};

type TemplateRow = {
  id: string;
  categoryId: string | null;
  sellDelivery: boolean;
  sellPickup: boolean;
  sellStorefront: boolean;
  sellPiece: boolean;
  sellSkewer: boolean;
  sortOrder: number;
};

const SEAFOOD_TEMPLATES = [
  "ปลาหมึกหลอด",
  "ปลาหมึกกรอบ",
  "กุ้งเสียบ",
  "หอยแมลงภู่",
  "ปลาดอลลี่",
  "แมงกะพรุน",
  "ไข่ปลาหมึก",
];
const BALL_TEMPLATES = [
  "ลูกชิ้นหมู",
  "ลูกชิ้นปลาย",
  "ไส้กรอกชีส",
  "ไส้กรอกนมชมพู",
  "ไส้กรอกหัวใจ",
];

function templateNamesForHint(hint: string | null, itemName: string): string[] {
  const h = `${hint ?? ""} ${itemName}`;
  if (/ทะเล|ปลาหมึก|กุ้ง|หอย|แมงกะพรุน|ไข่ปลา/.test(h)) {
    return [...SEAFOOD_TEMPLATES, ...BALL_TEMPLATES];
  }
  if (/ลูกชิ้น|ไส้กรอก|ปูอัด/.test(h)) {
    return [...BALL_TEMPLATES, ...SEAFOOD_TEMPLATES];
  }
  return [...BALL_TEMPLATES, ...SEAFOOD_TEMPLATES];
}

async function ensureBrandProduct(
  brandId: string,
  name: string,
  price: number,
  category: string | null,
) {
  const existing = await prisma.brandProduct.findFirst({
    where: { brandId, name, stockType: "SALE_ITEM" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.brandProduct.create({
    data: {
      brandId,
      name,
      stockType: "SALE_ITEM",
      unit: "ชิ้น",
      sellingPrice: price,
      trackStock: true,
      isActive: true,
      category: category ?? undefined,
    },
    select: { id: true },
  });
  return created.id;
}

async function findTemplate(
  branchId: string,
  names: string[],
): Promise<TemplateRow | null> {
  for (const name of names) {
    const row = await prisma.branchMenuItem.findFirst({
      where: { branchId, name, isHidden: false },
      select: {
        id: true,
        categoryId: true,
        sellDelivery: true,
        sellPickup: true,
        sellStorefront: true,
        sellPiece: true,
        sellSkewer: true,
        sortOrder: true,
      },
    });
    if (row) return row;
  }
  return null;
}

async function resolveCategoryId(
  branchId: string,
  hint: string | null,
  template: TemplateRow | null,
): Promise<string | null> {
  if (template?.categoryId) return template.categoryId;
  if (!hint) return null;
  const exact = await prisma.menuCategory.findFirst({
    where: { branchId, name: hint },
    select: { id: true },
  });
  if (exact) return exact.id;
  const fuzzy = await prisma.menuCategory.findFirst({
    where: { branchId, name: { contains: hint } },
    select: { id: true },
  });
  return fuzzy?.id ?? null;
}

async function resolveTargetBranches(opts: {
  brandId: string;
  currentBranchId: string;
  scope: QuickAddMenuScope;
  includeTest?: boolean;
}) {
  const all = await prisma.branch.findMany({
    where: { brandId: opts.brandId, kind: "STORE" },
    select: {
      id: true,
      name: true,
      brandId: true,
      stockEnabled: true,
      isTest: true,
    },
    orderBy: { name: "asc" },
  });

  const visible = opts.includeTest
    ? all
    : all.filter((b) => !isTestBranch(b));

  if (opts.scope.type === "current") {
    return visible.filter((b) => b.id === opts.currentBranchId);
  }
  if (opts.scope.type === "all") {
    return visible;
  }

  const needles = opts.scope.names.map((n) => n.toLowerCase());
  return visible.filter((b) => {
    const hay = b.name.toLowerCase();
    return needles.some((n) => hay.includes(n) || n.includes(hay));
  });
}

async function addToOneBranch(opts: {
  branch: {
    id: string;
    name: string;
    brandId: string | null;
    stockEnabled: boolean;
  };
  name: string;
  price: number;
  categoryHint: string | null;
  brandProductId: string | null;
  templateNames: string[];
}): Promise<QuickAddBranchResult> {
  const { branch, name, price, categoryHint, brandProductId, templateNames } =
    opts;

  try {
    const existing = await prisma.branchMenuItem.findFirst({
      where: { branchId: branch.id, name, isHidden: false },
      select: { id: true, brandProductId: true, stock: { select: { id: true } } },
    });
    if (existing) {
      if (brandProductId && existing.brandProductId !== brandProductId) {
        await prisma.branchMenuItem.update({
          where: { id: existing.id },
          data: { brandProductId },
        });
      }
      if (branch.stockEnabled && !existing.stock) {
        await prisma.branchMenuItemStock.create({
          data: {
            branchId: branch.id,
            menuItemId: existing.id,
            quantity: 0,
          },
        });
      }
      return {
        branchId: branch.id,
        branchName: branch.name,
        status: "skipped",
        menuItemId: existing.id,
        message: "มีเมนูนี้อยู่แล้ว",
      };
    }

    const template = await findTemplate(branch.id, templateNames);
    const categoryId = await resolveCategoryId(
      branch.id,
      categoryHint,
      template,
    );

    const maxSort = await prisma.branchMenuItem.aggregate({
      where: { branchId: branch.id },
      _max: { sortOrder: true },
    });
    const sortOrder =
      template?.sortOrder != null
        ? template.sortOrder + 1
        : (maxSort._max.sortOrder ?? 0) + 1;

    const item = await prisma.branchMenuItem.create({
      data: {
        branchId: branch.id,
        name,
        price,
        pickupPrice: price,
        storefrontPrice: price,
        sellDelivery: template?.sellDelivery ?? true,
        sellPickup: template?.sellPickup ?? true,
        sellStorefront: template?.sellStorefront ?? true,
        sellPiece: template?.sellPiece ?? true,
        sellSkewer: template?.sellSkewer ?? false,
        categoryId,
        sortOrder,
        isHidden: false,
        hideFromStaff: false,
        brandProductId,
      },
    });

    if (branch.stockEnabled) {
      await prisma.branchMenuItemStock.create({
        data: {
          branchId: branch.id,
          menuItemId: item.id,
          quantity: 0,
        },
      });
    }

    const groupIds = new Set<string>();
    if (template) {
      const links = await prisma.branchOptionGroupMenuItem.findMany({
        where: { menuItemId: template.id },
        select: { groupId: true },
      });
      for (const l of links) groupIds.add(l.groupId);
    }
    const promoGroups = await prisma.branchOptionGroup.findMany({
      where: {
        branchId: branch.id,
        mode: "FROM_MENU",
        name: { contains: "โปร" },
      },
      select: { id: true },
    });
    for (const g of promoGroups) groupIds.add(g.id);

    for (const groupId of groupIds) {
      const maxSrc = await prisma.branchOptionGroupMenuItem.aggregate({
        where: { groupId },
        _max: { sortOrder: true },
      });
      await prisma.branchOptionGroupMenuItem.upsert({
        where: {
          groupId_menuItemId: { groupId, menuItemId: item.id },
        },
        create: {
          groupId,
          menuItemId: item.id,
          sortOrder: (maxSrc._max.sortOrder ?? 0) + 1,
          isEnabled: true,
          priceDelta: 0,
        },
        update: { isEnabled: true },
      });
    }

    return {
      branchId: branch.id,
      branchName: branch.name,
      status: "created",
      menuItemId: item.id,
    };
  } catch (e) {
    return {
      branchId: branch.id,
      branchName: branch.name,
      status: "error",
      message: e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ",
    };
  }
}

export async function quickAddMenuToBranches(opts: {
  brandId: string;
  currentBranchId: string;
  command: QuickAddMenuCommand;
  includeTest?: boolean;
}): Promise<QuickAddMenuResult> {
  const price = defaultQuickAddPrice(opts.command);
  const name = opts.command.name.trim();
  const categoryHint = opts.command.categoryHint;
  const templateNames = templateNamesForHint(categoryHint, name);

  const targets = await resolveTargetBranches({
    brandId: opts.brandId,
    currentBranchId: opts.currentBranchId,
    scope: opts.command.scope,
    includeTest: opts.includeTest ?? false,
  });

  if (targets.length === 0) {
    return {
      name,
      price,
      categoryHint,
      results: [],
      created: 0,
      skipped: 0,
      errors: 0,
    };
  }

  const brandProductId = await ensureBrandProduct(
    opts.brandId,
    name,
    price,
    categoryHint,
  );

  const results: QuickAddBranchResult[] = [];
  for (const branch of targets) {
    results.push(
      await addToOneBranch({
        branch: {
          id: branch.id,
          name: branch.name,
          brandId: branch.brandId,
          stockEnabled: branch.stockEnabled,
        },
        name,
        price,
        categoryHint,
        brandProductId,
        templateNames,
      }),
    );
  }

  return {
    name,
    price,
    categoryHint,
    results,
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
  };
}

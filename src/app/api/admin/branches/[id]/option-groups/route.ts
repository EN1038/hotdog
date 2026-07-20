import { OptionGroupMode } from "@prisma/client";
import { z } from "zod";
import { requireBranchAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { branchOptionGroupInclude } from "@/lib/menu-option-groups";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";

type Params = { params: Promise<{ id: string }> };

const optionSchema = z.object({
  name: z.string().trim().min(1),
  priceDelta: z.number().optional(),
});

const createSchema = z
  .object({
    name: z.string().trim().min(1),
    mode: z.nativeEnum(OptionGroupMode).optional(),
    required: z.boolean().optional(),
    minSelect: z.number().int().min(0).optional(),
    maxSelect: z.number().int().min(1).optional(),
    allowDuplicateSelections: z.boolean().optional(),
    options: z.array(optionSchema).optional(),
    menuItemIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    const min = data.minSelect ?? 0;
    const max = data.maxSelect ?? 1;
    if (min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "จำนวนขั้นต่ำต้องไม่เกินจำนวนสูงสุด",
        path: ["minSelect"],
      });
    }
  });

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const groups = await prisma.branchOptionGroup.findMany({
      where: { branchId },
      include: branchOptionGroupInclude,
      orderBy: { createdAt: "asc" },
    });
    return jsonOk(groups);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: branchId } = await params;
    const { session } = await requireBranchAccess(branchId);
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return jsonError("ไม่พบสาขา", 404);

    const body = createSchema.parse(await request.json());
    const mode = body.mode ?? OptionGroupMode.MANUAL;
    const fromMenu = mode === OptionGroupMode.FROM_MENU;

    if (fromMenu && body.menuItemIds?.length) {
      const menus = await prisma.branchMenuItem.findMany({
        where: { branchId, id: { in: body.menuItemIds } },
        select: { id: true },
      });
      if (menus.length !== body.menuItemIds.length) {
        return jsonError("มีเมนูที่ไม่ใช่ของสาขานี้");
      }
    }

    const group = await prisma.branchOptionGroup.create({
      data: {
        branchId,
        name: body.name,
        mode,
        required: body.required ?? fromMenu,
        minSelect: body.minSelect ?? (fromMenu ? 11 : 0),
        maxSelect: body.maxSelect ?? (fromMenu ? 11 : 1),
        allowDuplicateSelections:
          body.allowDuplicateSelections ?? fromMenu,
        ...(body.options?.length && !fromMenu
          ? {
              options: {
                create: body.options.map((o) => ({
                  name: o.name,
                  priceDelta: o.priceDelta ?? 0,
                })),
              },
            }
          : {}),
        ...(fromMenu && body.menuItemIds?.length
          ? {
              menuItemSources: {
                create: body.menuItemIds.map((menuItemId, index) => ({
                  menuItemId,
                  sortOrder: index,
                  isEnabled: true,
                })),
              },
            }
          : {}),
      },
      include: branchOptionGroupInclude,
    });

    const ctx = await getBranchActivityContext(branchId);
    await logAdminActivity(session, {
      action: "option.create",
      summary: `เพิ่มหัวข้อตัวเลือก ${group.name}`,
      brandId: ctx?.brandId ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId,
      branchName: ctx?.name ?? null,
      entityType: "option_group",
      entityId: group.id,
      entityName: group.name,
    });

    return jsonOk(group, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

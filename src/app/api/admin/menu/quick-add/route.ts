import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { assertBrandAccess, assertBranchAccess } from "@/lib/admin-access";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { prisma } from "@/lib/db";
import {
  describeQuickAddCommand,
  parseQuickAddMenuCommand,
} from "@/lib/quick-add-menu-parse";
import { quickAddMenuToBranches } from "@/lib/quick-add-menu";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  /** Branch context — used for "สาขานี้" and brand scoping */
  branchId: z.string().min(1),
  includeTest: z.boolean().optional(),
  /** Skip parse — send structured fields instead */
  name: z.string().trim().min(1).max(80).optional(),
  price: z.number().nonnegative().max(99999).optional(),
  categoryHint: z.string().trim().max(80).nullable().optional(),
  scope: z
    .union([
      z.literal("all"),
      z.literal("current"),
      z.object({ type: z.literal("named"), names: z.array(z.string()).min(1) }),
    ])
    .optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const body = bodySchema.parse(await request.json());

    const branch = await prisma.branch.findUnique({
      where: { id: body.branchId },
      select: { id: true, name: true, brandId: true },
    });
    if (!branch) return jsonError("ไม่พบสาขา", 404);
    if (!branch.brandId) return jsonError("สาขานี้ยังไม่ผูกแบรนด์");
    await assertBranchAccess(session, branch.id);
    await assertBrandAccess(session, branch.brandId);

    let command = parseQuickAddMenuCommand(body.text);
    if (body.name) {
      const scope =
        body.scope === "all"
          ? ({ type: "all" } as const)
          : body.scope === "current" || body.scope == null
            ? ({ type: "current" } as const)
            : body.scope;
      command = {
        name: body.name,
        price: body.price ?? command?.price ?? null,
        categoryHint: body.categoryHint ?? command?.categoryHint ?? null,
        scope,
        raw: body.text,
      };
    }
    if (!command) {
      return jsonError(
        'อ่านคำสั่งไม่รู้เรื่อง — ลองแบบ "ชื่อ ลูกชิ้นปลาย เพิ่มทุกสาขา"',
      );
    }

    const result = await quickAddMenuToBranches({
      brandId: branch.brandId,
      currentBranchId: branch.id,
      command,
      includeTest: body.includeTest ?? false,
    });

    if (result.results.length === 0) {
      return jsonError("ไม่พบสาขาเป้าหมายที่ตรงเงื่อนไข");
    }

    await logAdminActivity(session, {
      action: "menu.quick_add",
      summary: `เพิ่มเมนูด่วน ${describeQuickAddCommand(command, {
        currentBranchName: branch.name,
      })} · สร้าง ${result.created} ข้าม ${result.skipped}`,
      brandId: branch.brandId,
      branchId: branch.id,
      branchName: branch.name,
      entityType: "menu",
      entityName: result.name,
      metadata: {
        price: result.price,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
        scope: command.scope,
        results: result.results.map((r) => ({
          branchId: r.branchId,
          status: r.status,
        })),
      },
    });

    return jsonOk({
      ok: true,
      command: {
        name: command.name,
        price: result.price,
        categoryHint: command.categoryHint,
        scope: command.scope,
        preview: describeQuickAddCommand(command, {
          currentBranchName: branch.name,
        }),
      },
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

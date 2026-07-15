import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  assertBrandAccess,
  getAccessibleBrandIds,
} from "@/lib/admin-access";
import {
  ADMIN_ACTIVITY_ACTIONS,
  type AdminActivityAction,
} from "@/lib/admin-activity-shared";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const querySchema = z.object({
  brandId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function parseDayStart(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDayEnd(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      brandId: url.searchParams.get("brandId") || undefined,
      branchId: url.searchParams.get("branchId") || undefined,
      action: url.searchParams.get("action") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      page: url.searchParams.get("page") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    if (!parsed.success) {
      return jsonError("พารามิเตอร์ไม่ถูกต้อง");
    }

    const { brandId, branchId, action, from, to, page, limit } = parsed.data;
    const scope = getAccessibleBrandIds(session);

    if (brandId) {
      await assertBrandAccess(session, brandId);
    }

    if (
      action &&
      !(action in ADMIN_ACTIVITY_ACTIONS)
    ) {
      return jsonError("ประเภทการกระทำไม่ถูกต้อง");
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, brandId: true },
      });
      if (!branch) return jsonError("ไม่พบสาขา", 404);
      await assertBrandAccess(session, branch.brandId);
      if (brandId && branch.brandId !== brandId) {
        return jsonError("สาขาไม่ได้อยู่ในแบรนด์ที่เลือก");
      }
    }

    const fromDate = parseDayStart(from);
    const toDate = parseDayEnd(to);
    if (from && !fromDate) return jsonError("วันเริ่มต้นไม่ถูกต้อง");
    if (to && !toDate) return jsonError("วันสิ้นสุดไม่ถูกต้อง");

    const where = {
      ...(scope === null ? {} : { brandId: { in: scope } }),
      ...(brandId ? { brandId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(action ? { action: action as AdminActivityAction } : {}),
      ...((fromDate || toDate) && {
        createdAt: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        },
      }),
    };

    const [total, items] = await Promise.all([
      prisma.adminActivityLog.count({ where }),
      prisma.adminActivityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          adminUsername: true,
          action: true,
          summary: true,
          brandId: true,
          brandName: true,
          branchId: true,
          branchName: true,
          entityType: true,
          entityId: true,
          entityName: true,
          metadata: true,
        },
      }),
    ]);

    return jsonOk({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

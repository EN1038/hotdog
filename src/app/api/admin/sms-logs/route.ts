import { z } from "zod";
import { SmsSendPurpose, SmsSendStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  assertBrandAccess,
  getAccessibleBrandIds,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  SMS_SEND_PURPOSE_LABELS,
  SMS_SEND_STATUS_LABELS,
} from "@/lib/sms-send-log-shared";

const querySchema = z.object({
  brandId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  purpose: z.nativeEnum(SmsSendPurpose).optional(),
  status: z.nativeEnum(SmsSendStatus).optional(),
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
      purpose: url.searchParams.get("purpose") || undefined,
      status: url.searchParams.get("status") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      page: url.searchParams.get("page") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    if (!parsed.success) {
      return jsonError("พารามิเตอร์ไม่ถูกต้อง");
    }

    const { brandId, branchId, purpose, status, from, to, page, limit } =
      parsed.data;
    const scope = getAccessibleBrandIds(session);

    if (brandId) {
      await assertBrandAccess(session, brandId);
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
      ...(purpose ? { purpose } : {}),
      ...(status ? { status } : {}),
      ...((fromDate || toDate) && {
        createdAt: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        },
      }),
    };

    const [total, items] = await Promise.all([
      prisma.smsSendLog.count({ where }),
      prisma.smsSendLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          brand: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true } },
          triggeredByAdmin: { select: { id: true, username: true } },
        },
      }),
    ]);

    return jsonOk({
      items: items.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        purpose: row.purpose,
        purposeLabel: SMS_SEND_PURPOSE_LABELS[row.purpose],
        status: row.status,
        statusLabel: SMS_SEND_STATUS_LABELS[row.status],
        toPhone: row.toPhone,
        toMsisdn: row.toMsisdn,
        body: row.body,
        provider: row.provider,
        providerMessageId: row.providerMessageId,
        errorMessage: row.errorMessage,
        brandId: row.brandId,
        brandName: row.brand?.name ?? null,
        branchId: row.branchId,
        branchName: row.branch?.name ?? null,
        skewerOrderId: row.skewerOrderId,
        orderNumber: row.orderNumber,
        triggeredByAdminId: row.triggeredByAdminId,
        triggeredByUsername: row.triggeredByAdmin?.username ?? null,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

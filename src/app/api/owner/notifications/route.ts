import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { normalizePhone } from "@/lib/constants";
import { getBrandSmsQuota } from "@/lib/brand-sms-quota";
import { getLineSettingsPublic } from "@/lib/line";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

const branchPatchSchema = z.object({
  branchId: z.string().min(1),
  alertSmsPhone: z.string().nullable().optional(),
  smsNotifyNewOrder: z.boolean().optional(),
  smsNotifySkewerOrder: z.boolean().optional(),
});

const patchSchema = z.object({
  lineNotifyNewOrder: z.boolean().optional(),
  lineNotifySkewerOrder: z.boolean().optional(),
  lineNotifyDailySummary: z.boolean().optional(),
  branches: z.array(branchPatchSchema).optional(),
});

async function resolveOwnerBrandId(session: SessionPayload): Promise<string | null> {
  const ids = getAccessibleBrandIds(session);
  if (ids === null || ids.length === 0) return null;
  return ids[0] ?? null;
}

export async function GET() {
  try {
    await ensureProdSchemaCompat();
    const session = await requireAdmin();
    const brandId = await resolveOwnerBrandId(session);
    if (!brandId) {
      return jsonError("ไม่พบแบรนด์ที่เข้าถึงได้", 404);
    }

    const [brand, branches, smsQuota, lineSettings] = await Promise.all([
      prisma.brand.findUnique({
        where: { id: brandId },
        select: {
          id: true,
          name: true,
          nameTh: true,
          lineNotifyNewOrder: true,
          lineNotifySkewerOrder: true,
          lineNotifyDailySummary: true,
          smsQuotaGranted: true,
        },
      }),
      prisma.branch.findMany({
        where: { brandId, isHidden: false },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          kind: true,
          isTest: true,
          operatingMode: true,
          alertSmsPhone: true,
          smsNotifyNewOrder: true,
          smsNotifySkewerOrder: true,
        },
      }),
      getBrandSmsQuota(brandId),
      getLineSettingsPublic(),
    ]);

    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    const linkedAdmin = await prisma.admin.count({
      where: {
        lineUserId: { not: null },
        brandMembers: {
          some: { brandId, role: { in: ["OWNER", "MANAGER"] } },
        },
      },
    });

    return jsonOk({
      brand: {
        id: brand.id,
        name: brand.nameTh || brand.name,
        lineNotifyNewOrder: brand.lineNotifyNewOrder,
        lineNotifySkewerOrder: brand.lineNotifySkewerOrder,
        lineNotifyDailySummary: brand.lineNotifyDailySummary,
      },
      sms: smsQuota,
      line: {
        platformReady:
          lineSettings.configured && lineSettings.messagingEnabled,
        linkedOwnerCount: linkedAdmin,
        connectUrl: "/admin/line-connect",
      },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        isTest: b.isTest,
        operatingMode: b.operatingMode,
        alertSmsPhone: b.alertSmsPhone,
        smsNotifyNewOrder: b.smsNotifyNewOrder,
        smsNotifySkewerOrder: b.smsNotifySkewerOrder,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin();
    const brandId = await resolveOwnerBrandId(session);
    if (!brandId) {
      return jsonError("ไม่พบแบรนด์ที่เข้าถึงได้", 404);
    }

    const body = patchSchema.parse(await request.json());

    if (
      body.lineNotifyNewOrder !== undefined ||
      body.lineNotifySkewerOrder !== undefined ||
      body.lineNotifyDailySummary !== undefined
    ) {
      await prisma.brand.update({
        where: { id: brandId },
        data: {
          ...(body.lineNotifyNewOrder !== undefined && {
            lineNotifyNewOrder: body.lineNotifyNewOrder,
          }),
          ...(body.lineNotifySkewerOrder !== undefined && {
            lineNotifySkewerOrder: body.lineNotifySkewerOrder,
          }),
          ...(body.lineNotifyDailySummary !== undefined && {
            lineNotifyDailySummary: body.lineNotifyDailySummary,
          }),
        },
      });
    }

    if (body.branches?.length) {
      const allowed = await prisma.branch.findMany({
        where: { brandId },
        select: { id: true },
      });
      const allowedIds = new Set(allowed.map((b) => b.id));

      for (const row of body.branches) {
        if (!allowedIds.has(row.branchId)) {
          return jsonError("ไม่พบสาขาในแบรนด์นี้", 400);
        }
        const phone =
          row.alertSmsPhone === undefined
            ? undefined
            : row.alertSmsPhone?.trim()
              ? normalizePhone(row.alertSmsPhone)
              : null;

        await prisma.branch.update({
          where: { id: row.branchId },
          data: {
            ...(phone !== undefined && { alertSmsPhone: phone }),
            ...(row.smsNotifyNewOrder !== undefined && {
              smsNotifyNewOrder: row.smsNotifyNewOrder,
            }),
            ...(row.smsNotifySkewerOrder !== undefined && {
              smsNotifySkewerOrder: row.smsNotifySkewerOrder,
            }),
          },
        });
      }
    }

    return GET();
  } catch (error) {
    return handleApiError(error);
  }
}

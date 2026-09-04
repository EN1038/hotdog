import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAccessibleBrandIds } from "@/lib/admin-access";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { normalizePhone } from "@/lib/constants";
import { getBrandSmsQuota } from "@/lib/brand-sms-quota";
import {
  brandLinePushText,
  brandLineWebhookUrl,
  isBrandLineMessagingReady,
} from "@/lib/brand-line";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

const branchPatchSchema = z.object({
  branchId: z.string().min(1),
  alertSmsPhone: z.string().nullable().optional(),
  smsNotifyNewOrder: z.boolean().optional(),
  smsNotifySkewerOrder: z.boolean().optional(),
});

const patchSchema = z.object({
  notificationChannel: z.enum(["sms", "line"]).optional(),
  lineNotifyNewOrder: z.boolean().optional(),
  lineNotifySkewerOrder: z.boolean().optional(),
  lineNotifyDailySummary: z.boolean().optional(),
  channelAccessToken: z.string().optional(),
  channelSecret: z.string().optional(),
  clearAccessToken: z.boolean().optional(),
  clearChannelSecret: z.boolean().optional(),
  messagingEnabled: z.boolean().optional(),
  branches: z.array(branchPatchSchema).optional(),
});

async function resolveOwnerBrandId(
  session: SessionPayload,
): Promise<string | null> {
  const ids = getAccessibleBrandIds(session);
  if (ids === null || ids.length === 0) return null;
  return ids[0] ?? null;
}

async function buildResponse(brandId: string, adminId: string | undefined) {
  const [brand, branches, smsQuota, self] = await Promise.all([
    prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        id: true,
        name: true,
        nameTh: true,
        lineNotifyNewOrder: true,
        lineNotifySkewerOrder: true,
        lineNotifyDailySummary: true,
        lineChannelAccessToken: true,
        lineChannelSecret: true,
        lineMessagingEnabled: true,
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
    adminId
      ? prisma.admin.findUnique({
          where: { id: adminId },
          select: {
            lineUserId: true,
            lineNotifyEnabled: true,
            lineLinkCode: true,
            lineLinkCodeExpiresAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!brand) return null;

  const linkedAdmin = await prisma.admin.count({
    where: {
      lineUserId: { not: null },
      brandMembers: {
        some: { brandId, role: { in: ["OWNER", "MANAGER"] } },
      },
    },
  });

  const linkedStaff = await prisma.staff.count({
    where: {
      lineUserId: { not: null },
      isActive: true,
      branch: { brandId },
    },
  });

  const now = new Date();
  const codeActive =
    Boolean(self?.lineLinkCode) &&
    self?.lineLinkCodeExpiresAt != null &&
    self.lineLinkCodeExpiresAt.getTime() > now.getTime();

  const hasToken = Boolean(brand.lineChannelAccessToken?.trim());
  const hasSecret = Boolean(brand.lineChannelSecret?.trim());
  const ready = await isBrandLineMessagingReady(brandId);

  return {
    brand: {
      id: brand.id,
      name: brand.nameTh || brand.name,
      lineNotifyNewOrder: brand.lineNotifyNewOrder,
      lineNotifySkewerOrder: brand.lineNotifySkewerOrder,
      lineNotifyDailySummary: brand.lineNotifyDailySummary,
      lineMessagingEnabled: brand.lineMessagingEnabled,
      hasAccessToken: hasToken,
      hasChannelSecret: hasSecret,
    },
    sms: smsQuota,
    line: {
      ready,
      configured: hasToken && hasSecret,
      messagingEnabled: brand.lineMessagingEnabled,
      webhookUrl: brandLineWebhookUrl(brandId),
      linkedOwnerCount: linkedAdmin,
      linkedStaffCount: linkedStaff,
      selfLinked: Boolean(self?.lineUserId),
      activeCode: codeActive ? self?.lineLinkCode ?? null : null,
      codeExpiresAt: codeActive
        ? self?.lineLinkCodeExpiresAt?.toISOString() ?? null
        : null,
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
  };
}

export async function GET() {
  try {
    await ensureProdSchemaCompat();
    const session = await requireAdmin();
    const brandId = await resolveOwnerBrandId(session);
    if (!brandId) {
      return jsonError("ไม่พบแบรนด์ที่เข้าถึงได้", 404);
    }

    const payload = await buildResponse(brandId, session.adminId);
    if (!payload) return jsonError("ไม่พบแบรนด์", 404);
    return jsonOk(payload);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireAdmin();
    const brandId = await resolveOwnerBrandId(session);
    if (!brandId) {
      return jsonError("ไม่พบแบรนด์ที่เข้าถึงได้", 404);
    }

    const body = patchSchema.parse(await request.json());

    const credentialData: {
      lineChannelAccessToken?: string | null;
      lineChannelSecret?: string | null;
      lineMessagingEnabled?: boolean;
    } = {};

    if (body.clearAccessToken) {
      credentialData.lineChannelAccessToken = null;
    } else if (body.channelAccessToken !== undefined) {
      const trimmed = body.channelAccessToken.trim();
      if (trimmed) credentialData.lineChannelAccessToken = trimmed;
    }

    if (body.clearChannelSecret) {
      credentialData.lineChannelSecret = null;
    } else if (body.channelSecret !== undefined) {
      const trimmed = body.channelSecret.trim();
      if (trimmed) credentialData.lineChannelSecret = trimmed;
    }

    if (body.messagingEnabled !== undefined) {
      credentialData.lineMessagingEnabled = body.messagingEnabled;
    }

    if (Object.keys(credentialData).length > 0) {
      await prisma.brand.update({
        where: { id: brandId },
        data: credentialData,
      });
    }

    if (body.notificationChannel === "line") {
      await prisma.brand.update({
        where: { id: brandId },
        data: {
          lineNotifyNewOrder: true,
          lineNotifySkewerOrder: true,
          lineNotifyDailySummary: true,
          lineMessagingEnabled: true,
        },
      });
      await prisma.branch.updateMany({
        where: { brandId, isHidden: false },
        data: {
          alertSmsPhone: null,
          smsNotifyNewOrder: false,
          smsNotifySkewerOrder: false,
        },
      });
    }

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

    const payload = await buildResponse(brandId, session.adminId);
    if (!payload) return jsonError("ไม่พบแบรนด์", 404);
    return jsonOk(payload);
  } catch (error) {
    return handleApiError(error);
  }
}

const testSchema = z.object({
  message: z.string().trim().min(1).max(500).optional(),
});

/** Send a test LINE push to the logged-in owner (must already be linked). */
export async function POST(request: Request) {
  try {
    await ensureProdSchemaCompat();
    const session = await requireAdmin();
    const brandId = await resolveOwnerBrandId(session);
    if (!brandId) {
      return jsonError("ไม่พบแบรนด์ที่เข้าถึงได้", 404);
    }
    if (!session.adminId) return jsonError("ไม่มีสิทธิ์", 403);

    const body = testSchema.parse(await request.json().catch(() => ({})));
    const admin = await prisma.admin.findUnique({
      where: { id: session.adminId },
      select: { lineUserId: true },
    });
    if (!admin?.lineUserId) {
      return jsonError("ยังไม่ได้เชื่อม LINE — สร้างรหัสแล้วส่งในแชท OA ของร้าน", 400);
    }

    const result = await brandLinePushText(
      brandId,
      admin.lineUserId,
      body.message?.trim() ||
        "ทดสอบแจ้งเตือนจาก SkillSale — ถ้าเห็นข้อความนี้ ระบบ LINE ร้านพร้อมแล้ว",
    );
    if (!result.ok) {
      return jsonError(result.error ?? "ส่งไม่สำเร็จ", 502);
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

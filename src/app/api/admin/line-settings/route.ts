import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  getLineSettingsPublic,
  linePushText,
} from "@/lib/line";

const patchSchema = z.object({
  channelAccessToken: z.string().optional(),
  channelSecret: z.string().optional(),
  clearAccessToken: z.boolean().optional(),
  clearChannelSecret: z.boolean().optional(),
  messagingEnabled: z.boolean().optional(),
  notifyStaffOnNewOrder: z.boolean().optional(),
});

const testSchema = z.object({
  staffId: z.string().min(1).optional(),
  lineUserId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(500).optional(),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    return jsonOk(await getLineSettingsPublic());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = patchSchema.parse(await request.json());

    const data: {
      lineChannelAccessToken?: string | null;
      lineChannelSecret?: string | null;
      lineMessagingEnabled?: boolean;
      lineNotifyStaffOnNewOrder?: boolean;
    } = {};

    if (body.clearAccessToken) {
      data.lineChannelAccessToken = null;
    } else if (body.channelAccessToken !== undefined) {
      const trimmed = body.channelAccessToken.trim();
      if (trimmed) data.lineChannelAccessToken = trimmed;
    }

    if (body.clearChannelSecret) {
      data.lineChannelSecret = null;
    } else if (body.channelSecret !== undefined) {
      const trimmed = body.channelSecret.trim();
      if (trimmed) data.lineChannelSecret = trimmed;
    }

    if (body.messagingEnabled !== undefined) {
      data.lineMessagingEnabled = body.messagingEnabled;
    }
    if (body.notifyStaffOnNewOrder !== undefined) {
      data.lineNotifyStaffOnNewOrder = body.notifyStaffOnNewOrder;
    }

    if (Object.keys(data).length === 0) {
      return jsonError("ไม่มีข้อมูลที่จะอัปเดต");
    }

    await prisma.siteSettings.upsert({
      where: { id: "default" },
      update: data,
      create: {
        id: "default",
        ...data,
      },
    });

    await logAdminActivity(session, {
      action: "line.update",
      summary: "อัปเดตตั้งค่า LINE Official Account",
      metadata: {
        fields: Object.keys(body).filter(
          (k) => k !== "channelAccessToken" && k !== "channelSecret",
        ),
      },
    });

    return jsonOk(await getLineSettingsPublic());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = testSchema.parse(await request.json());

    let lineUserId = body.lineUserId?.trim() || "";
    if (!lineUserId && body.staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: body.staffId },
        select: { lineUserId: true, name: true, phone: true },
      });
      if (!staff?.lineUserId) {
        return jsonError("พนักงานคนนี้ยังไม่ได้เชื่อม LINE", 400);
      }
      lineUserId = staff.lineUserId;
    }
    if (!lineUserId) {
      return jsonError("ระบุ staffId หรือ lineUserId");
    }

    const message =
      body.message?.trim() ||
      "ทดสอบการแจ้งเตือนจาก SkillSale — เชื่อมต่อ LINE สำเร็จ";
    const result = await linePushText(lineUserId, message);
    if (!result.ok) {
      return jsonError(result.error, 400);
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

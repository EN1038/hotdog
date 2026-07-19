import { createHmac, timingSafeEqual } from "crypto";
import { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { appAbsoluteUrl } from "@/lib/app-url";
import type { LineSettingsPublic } from "@/lib/line-settings-types";

export type { LineSettingsPublic } from "@/lib/line-settings-types";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

export type LineCredentials = {
  accessToken: string;
  channelSecret: string;
  source: "env" | "database" | "mixed";
};

export async function getLineSettingsPublic(): Promise<LineSettingsPublic> {
  const row = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: {
      lineChannelAccessToken: true,
      lineChannelSecret: true,
      lineMessagingEnabled: true,
      lineNotifyStaffOnNewOrder: true,
    },
  });

  const envToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
  const envSecret = process.env.LINE_CHANNEL_SECRET?.trim() || "";
  const dbToken = row?.lineChannelAccessToken?.trim() || "";
  const dbSecret = row?.lineChannelSecret?.trim() || "";

  const accessTokenSource = envToken
    ? "env"
    : dbToken
      ? "database"
      : "none";
  const channelSecretSource = envSecret
    ? "env"
    : dbSecret
      ? "database"
      : "none";

  const hasAccessToken = accessTokenSource !== "none";
  const hasChannelSecret = channelSecretSource !== "none";
  const linkedStaffCount = await prisma.staff.count({
    where: { lineUserId: { not: null } },
  });

  return {
    configured: hasAccessToken && hasChannelSecret,
    messagingEnabled: row?.lineMessagingEnabled ?? false,
    notifyStaffOnNewOrder: row?.lineNotifyStaffOnNewOrder ?? true,
    hasAccessToken,
    hasChannelSecret,
    accessTokenSource,
    channelSecretSource,
    webhookUrl: appAbsoluteUrl("/api/line/webhook"),
    linkedStaffCount,
  };
}

export async function getLineCredentials(): Promise<LineCredentials | null> {
  const row = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: {
      lineChannelAccessToken: true,
      lineChannelSecret: true,
    },
  });

  const envToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
  const envSecret = process.env.LINE_CHANNEL_SECRET?.trim() || "";
  const dbToken = row?.lineChannelAccessToken?.trim() || "";
  const dbSecret = row?.lineChannelSecret?.trim() || "";

  const accessToken = envToken || dbToken;
  const channelSecret = envSecret || dbSecret;
  if (!accessToken || !channelSecret) return null;

  const source =
    envToken && envSecret
      ? "env"
      : !envToken && !envSecret
        ? "database"
        : "mixed";

  return { accessToken, channelSecret, source };
}

export async function isLineMessagingReady() {
  const creds = await getLineCredentials();
  if (!creds) return false;
  const row = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: { lineMessagingEnabled: true },
  });
  return Boolean(row?.lineMessagingEnabled);
}

export function verifyLineWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  channelSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const digest = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function lineApiPost(
  url: string,
  accessToken: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text().catch(() => "");
  return {
    ok: false,
    status: res.status,
    error: text.slice(0, 300) || `LINE API ${res.status}`,
  };
}

export async function linePushText(lineUserId: string, text: string) {
  const creds = await getLineCredentials();
  if (!creds) {
    return { ok: false as const, error: "ยังไม่ได้ตั้งค่า LINE Channel" };
  }
  const result = await lineApiPost(LINE_PUSH_URL, creds.accessToken, {
    to: lineUserId,
    messages: [{ type: "text", text }],
  });
  if (!result.ok) {
    return { ok: false as const, error: result.error ?? "ส่งไม่สำเร็จ" };
  }
  return { ok: true as const };
}

export async function lineReplyText(replyToken: string, text: string) {
  const creds = await getLineCredentials();
  if (!creds) {
    return { ok: false as const, error: "ยังไม่ได้ตั้งค่า LINE Channel" };
  }
  const result = await lineApiPost(LINE_REPLY_URL, creds.accessToken, {
    replyToken,
    messages: [{ type: "text", text }],
  });
  if (!result.ok) {
    return { ok: false as const, error: result.error ?? "ตอบกลับไม่สำเร็จ" };
  }
  return { ok: true as const };
}

/** Link staff by phone digits typed in LINE chat. */
export async function tryLinkStaffByPhoneMessage(
  lineUserId: string,
  rawText: string,
): Promise<{ linked: boolean; reply: string }> {
  const digits = normalizePhone(rawText);
  if (digits.length < 9 || digits.length > 12) {
    return {
      linked: false,
      reply:
        "ส่งเบอร์โทรพนักงานในระบบมาเพื่อผูกบัญชี เช่น 0812345678",
    };
  }

  const staff = await prisma.staff.findUnique({
    where: { phone: digits },
    include: { branch: { select: { name: true } } },
  });
  if (!staff) {
    return {
      linked: false,
      reply: `ไม่พบพนักงานเบอร์ ${digits} ในระบบ กรุณาตรวจสอบกับแอดมิน`,
    };
  }
  if (!staff.isActive) {
    return {
      linked: false,
      reply: "บัญชีพนักงานนี้ถูกปิดใช้งานอยู่",
    };
  }

  await prisma.staff.updateMany({
    where: { lineUserId, NOT: { id: staff.id } },
    data: { lineUserId: null },
  });

  await prisma.staff.update({
    where: { id: staff.id },
    data: { lineUserId },
  });

  const name = staff.name?.trim() || staff.phone;
  return {
    linked: true,
    reply: `เชื่อมต่อสำเร็จ\n${name} · ${staff.branch.name}\nจะได้รับการแจ้งเตือนออเดอร์ทาง LINE`,
  };
}

export type NewOrderNotifyInput = {
  id: string;
  orderNumber: string;
  branchId: string;
  fulfillmentType: string;
  customerName: string;
  customerPhone: string;
  status: string;
};

/** Fire-and-forget safe: never throws to callers. */
export async function notifyStaffNewOrder(order: NewOrderNotifyInput) {
  try {
    if (!(await isLineMessagingReady())) return;

    const settings = await prisma.siteSettings.findUnique({
      where: { id: "default" },
      select: { lineNotifyStaffOnNewOrder: true },
    });
    if (!settings?.lineNotifyStaffOnNewOrder) return;

    const staff = await prisma.staff.findMany({
      where: {
        branchId: order.branchId,
        isActive: true,
        lineNotifyEnabled: true,
        lineUserId: { not: null },
        roles: { some: { role: StaffRole.SELLER } },
      },
      select: { lineUserId: true, name: true, phone: true },
    });

    if (staff.length === 0) return;

    const fulfillment =
      order.fulfillmentType === "PICKUP" ? "รับที่ร้าน" : "จัดส่ง";
    const staffUrl = appAbsoluteUrl("/staff");
    const text = [
      "ออเดอร์ใหม่",
      `#${order.orderNumber}`,
      `${fulfillment} · ${order.customerName || "ลูกค้า"}`,
      order.customerPhone ? `โทร ${order.customerPhone}` : null,
      staffUrl ? `เปิดดู: ${staffUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await Promise.allSettled(
      staff.map((s) =>
        s.lineUserId ? linePushText(s.lineUserId, text) : Promise.resolve(),
      ),
    );
  } catch (error) {
    console.error("[line] notifyStaffNewOrder failed", error);
  }
}

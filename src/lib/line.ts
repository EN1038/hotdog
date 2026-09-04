import { createHmac, timingSafeEqual } from "crypto";
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
      lineNotifyOwnerRegistration: true,
      lineAdminRichMenuId: true,
      lineGuestRichMenuId: true,
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
  const [linkedStaffCount, linkedAdminCount, unlockedLineUserCount] =
    await Promise.all([
      prisma.staff.count({
        where: { lineUserId: { not: null } },
      }),
      prisma.admin.count({
        where: { lineUserId: { not: null } },
      }),
      prisma.platformLineUser.count().catch(() => 0),
    ]);

  return {
    configured: hasAccessToken && hasChannelSecret,
    messagingEnabled: row?.lineMessagingEnabled ?? false,
    notifyStaffOnNewOrder: false,
    notifyBrandDailySummary: false,
    notifyOwnerRegistration: row?.lineNotifyOwnerRegistration ?? true,
    unlockedLineUserCount,
    hasAccessToken,
    hasChannelSecret,
    accessTokenSource,
    channelSecretSource,
    webhookUrl: appAbsoluteUrl("/api/line/webhook"),
    linkedStaffCount,
    linkedAdminCount,
    adminRichMenuId: row?.lineAdminRichMenuId ?? null,
    guestRichMenuId: row?.lineGuestRichMenuId ?? null,
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

export type LineReplyOptions = {
  quickReply?: Array<{ label: string; data: string; displayText?: string }>;
};

export async function lineReplyText(
  replyToken: string,
  text: string,
  options?: LineReplyOptions,
) {
  const creds = await getLineCredentials();
  if (!creds) {
    return { ok: false as const, error: "ยังไม่ได้ตั้งค่า LINE Channel" };
  }
  const message: Record<string, unknown> = { type: "text", text };
  if (options?.quickReply?.length) {
    message.quickReply = {
      items: options.quickReply.slice(0, 13).map((item) => ({
        type: "action",
        action: {
          type: "postback",
          label: item.label.slice(0, 20),
          data: item.data.slice(0, 300),
          displayText: (item.displayText ?? item.label).slice(0, 300),
        },
      })),
    };
  }
  const result = await lineApiPost(LINE_REPLY_URL, creds.accessToken, {
    replyToken,
    messages: [message],
  });
  if (!result.ok) {
    return { ok: false as const, error: result.error ?? "ตอบกลับไม่สำเร็จ" };
  }
  return { ok: true as const };
}

export async function linkRichMenuToUser(
  lineUserId: string,
  richMenuId: string,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await getLineCredentials();
  if (!creds) return { ok: false, error: "ยังไม่ได้ตั้งค่า LINE Channel" };
  const res = await fetch(
    `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: text.slice(0, 300) || `LINE rich menu link ${res.status}`,
    };
  }
  return { ok: true };
}

export async function unlinkRichMenuFromUser(
  lineUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await getLineCredentials();
  if (!creds) return { ok: false, error: "ยังไม่ได้ตั้งค่า LINE Channel" };
  const res = await fetch(
    `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: text.slice(0, 300) || `LINE rich menu unlink ${res.status}`,
    };
  }
  return { ok: true };
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

  const staffRows = await prisma.staff.findMany({
    where: { phone: digits, isActive: true },
    include: { branch: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (staffRows.length === 0) {
    return {
      linked: false,
      reply: `ไม่พบพนักงานเบอร์ ${digits} ในระบบ กรุณาตรวจสอบกับแอดมิน`,
    };
  }

  // Clear this LINE from any other phones, then attach to all memberships of this phone
  await prisma.staff.updateMany({
    where: { lineUserId, NOT: { phone: digits } },
    data: { lineUserId: null },
  });
  await prisma.staff.updateMany({
    where: { phone: digits },
    data: { lineUserId },
  });

  const staff = staffRows[0]!;
  const name = staff.name?.trim() || staff.phone;
  const branchNames = staffRows.map((s) => s.branch.name).join(", ");
  return {
    linked: true,
    reply: `เชื่อมต่อสำเร็จ\n${name} · ${branchNames}\nจะได้รับการแจ้งเตือนออเดอร์ทาง LINE`,
  };
}

/** Link brand admin by one-time code from the logged-in admin UI. */
export async function tryLinkAdminByLinkCodeMessage(
  lineUserId: string,
  rawText: string,
): Promise<{ linked: boolean; reply: string }> {
  const codeMatch = rawText.trim().match(/\b(\d{6})\b/);
  const code = codeMatch?.[1] ?? "";
  if (!code) {
    return {
      linked: false,
      reply:
        "ส่งรหัส 6 หลักจาก /admin/line-connect เพื่อเชื่อมสิทธิ์แก้ไข-ลบออเดอร์",
    };
  }

  const now = new Date();
  const admin = await prisma.admin.findFirst({
    where: {
      lineLinkCode: code,
      lineLinkCodeExpiresAt: { gt: now },
    },
    include: {
      brandMembers: {
        select: {
          role: true,
          brandId: true,
          brand: { select: { name: true } },
        },
      },
    },
  });

  if (!admin) {
    return {
      linked: false,
      reply:
        "รหัสไม่ถูกต้องหรือหมดอายุแล้ว\nเข้าแอดมิน → เชื่อม LINE เพื่อขอรหัสใหม่",
    };
  }

  if (!admin.isPlatformAdmin) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lineLinkCode: null, lineLinkCodeExpiresAt: null },
    });
    return {
      linked: false,
      reply:
        "บัญชีนี้ไม่มีสิทธิ์เชื่อม LINE หลังบ้าน (ต้องเป็นแอดมินแพลตฟอร์ม)",
    };
  }

  await prisma.admin.updateMany({
    where: { lineUserId, NOT: { id: admin.id } },
    data: { lineUserId: null },
  });

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lineUserId,
      lineLinkCode: null,
      lineLinkCodeExpiresAt: null,
    },
  });

  const settings = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: { lineAdminRichMenuId: true },
  });
  if (settings?.lineAdminRichMenuId) {
    await linkRichMenuToUser(lineUserId, settings.lineAdminRichMenuId).catch(
      () => undefined,
    );
  }

  const { logLineAdminActivity } = await import("@/lib/line-activity");
  await logLineAdminActivity(
    {
      id: admin.id,
      username: admin.username,
      isPlatformAdmin: true,
      brandMembers: [],
    },
    {
      action: "line.link",
      summary: `เชื่อม LINE สำเร็จ — ${admin.username} · แอดมินแพลตฟอร์ม`,
      metadata: { source: "line_chat_code" },
    },
  );

  return {
    linked: true,
    reply: [
      "เชื่อมต่อแอดมินสำเร็จ",
      `${admin.username} · แอดมินแพลตฟอร์ม`,
      "ใช้เมนูล่าง: โหมดลบ · โหมดแก้ไข · ช่วยเหลือ",
      "หรือพิมพ์ เช่น ลบ A1048 แล้วกดยืนยัน",
    ].join("\n"),
  };
}

/**
 * Staff: phone (9–12 digits). Brand admin: 6-digit one-time code from admin UI.
 */
export async function tryLinkLineAccountFromMessage(
  lineUserId: string,
  rawText: string,
): Promise<{ linked: boolean; reply: string }> {
  const digits = normalizePhone(rawText);
  if (digits.length >= 9 && digits.length <= 12) {
    return tryLinkStaffByPhoneMessage(lineUserId, rawText);
  }
  return tryLinkAdminByLinkCodeMessage(lineUserId, rawText);
}

export const LINE_FOLLOW_REPLY =
  "ระบบ SkillSale POS หลังบ้าน\nโปรดบอกรหัสผ่าน";

export const ADMIN_LINE_LINK_CODE_TTL_MS = 10 * 60 * 1000;

export type NewOrderNotifyInput = {
  id: string;
  orderNumber: string;
  queueNumber?: number | null;
  branchId: string;
  fulfillmentType: string;
  customerName: string;
  customerPhone: string;
  status: string;
};

/** @deprecated Platform OA no longer notifies staff on new orders. */
export async function notifyStaffNewOrder(_order: NewOrderNotifyInput) {
  return;
}

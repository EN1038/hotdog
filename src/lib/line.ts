import { createHmac, timingSafeEqual } from "crypto";
import { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone, formatPrice } from "@/lib/constants";
import { appAbsoluteUrl, appAbsoluteUrlOrNull } from "@/lib/app-url";
import type { LineSettingsPublic } from "@/lib/line-settings-types";
import { orderGrandTotal } from "@/lib/order-totals";

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
      lineNotifyBrandDailySummary: true,
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
  const [linkedStaffCount, linkedAdminCount] = await Promise.all([
    prisma.staff.count({
      where: { lineUserId: { not: null } },
    }),
    prisma.admin.count({
      where: { lineUserId: { not: null } },
    }),
  ]);

  return {
    configured: hasAccessToken && hasChannelSecret,
    messagingEnabled: row?.lineMessagingEnabled ?? false,
    notifyStaffOnNewOrder: row?.lineNotifyStaffOnNewOrder ?? true,
    notifyBrandDailySummary: row?.lineNotifyBrandDailySummary ?? true,
    hasAccessToken,
    hasChannelSecret,
    accessTokenSource,
    channelSecretSource,
    webhookUrl: appAbsoluteUrl("/api/line/webhook"),
    linkedStaffCount,
    linkedAdminCount,
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
        "เจ้าของแบรนด์: เข้าแอดมิน → เชื่อม LINE แล้วส่งรหัส 6 หลักในแชทนี้\nพนักงาน: ส่งเบอร์โทรในระบบ เช่น 0812345678",
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

  const brandRoles = admin.brandMembers.filter(
    (m) => m.role === "OWNER" || m.role === "MANAGER",
  );
  if (brandRoles.length === 0) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lineLinkCode: null, lineLinkCodeExpiresAt: null },
    });
    return {
      linked: false,
      reply:
        "บัญชีนี้ไม่ใช่เจ้าของ/ผู้จัดการแบรนด์ จึงผูกเพื่อรับสรุปรอบขายไม่ได้",
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

  const brandNames = brandRoles.map((m) => m.brand.name).filter(Boolean);
  const brandLine =
    brandNames.slice(0, 3).join(", ") +
    (brandNames.length > 3 ? ` และอีก ${brandNames.length - 3}` : "");

  return {
    linked: true,
    reply: [
      "เชื่อมต่อแอดมินสำเร็จ",
      `${admin.username} · ${brandLine}`,
      "จะได้รับสรุปรอบขายของสาขาทาง LINE",
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
  "ยินดีต้อนรับ\n• พนักงาน: ส่งเบอร์โทรในระบบ เช่น 0812345678\n• เจ้าของแบรนด์: เข้าแอดมิน → เชื่อม LINE แล้วส่งรหัส 6 หลักมาที่นี่";

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

function formatNewOrderNotifyText(input: {
  orderNumber: string;
  queueNumber: number | null;
  branchName: string;
  fulfillmentType: string;
  customerName: string;
  customerPhone: string;
  addressLine: string | null;
  note: string | null;
  items: Array<{ name: string; quantity: number; optionsText: string | null }>;
  total: number;
  staffUrl: string | null;
}): string {
  const fulfillment =
    input.fulfillmentType === "PICKUP" ? "รับที่ร้าน" : "จัดส่ง";
  const customer =
    input.customerName.trim() ||
    (input.customerPhone ? `ลูกค้า ${input.customerPhone}` : "ลูกค้า");

  const itemLines =
    input.items.length === 0
      ? ["· (ไม่มีรายการ)"]
      : input.items.map((it) => {
          const opts = it.optionsText?.trim();
          return opts
            ? `· ${it.name} ×${it.quantity} (${opts})`
            : `· ${it.name} ×${it.quantity}`;
        });

  const lines = [
    "ออเดอร์ใหม่",
    input.queueNumber != null
      ? `คิว ${input.queueNumber} · #${input.orderNumber}`
      : `#${input.orderNumber}`,
    input.branchName,
    "",
    fulfillment,
    `ลูกค้า: ${customer}`,
    input.customerPhone ? `โทร: ${input.customerPhone}` : null,
    input.addressLine ? `ที่อยู่: ${input.addressLine}` : null,
    input.note ? `หมายเหตุ: ${input.note}` : null,
    "",
    "รายการ:",
    ...itemLines,
    "",
    `รวม ฿${formatPrice(input.total)}`,
    input.staffUrl ? `\nเปิดดู: ${input.staffUrl}` : null,
  ];

  return lines.filter((l) => l !== null).join("\n");
}

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
      select: { lineUserId: true },
    });
    if (staff.length === 0) return;

    const full = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        orderNumber: true,
        queueNumber: true,
        fulfillmentType: true,
        customerName: true,
        customerPhone: true,
        addressDetail: true,
        note: true,
        deliveryFee: true,
        discountAmount: true,
        branch: { select: { name: true } },
        deliveryLocation: { select: { name: true, address: true } },
        items: {
          select: {
            itemName: true,
            quantity: true,
            unitPrice: true,
            optionsPrice: true,
            optionsText: true,
          },
        },
      },
    });
    if (!full) return;

    const total = orderGrandTotal(
      full.items.map((it) => ({
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        optionsPrice: Number(it.optionsPrice),
      })),
      Number(full.deliveryFee),
      Number(full.discountAmount),
    );

    let addressLine: string | null = null;
    if (full.fulfillmentType === "DELIVERY") {
      const parts = [
        full.deliveryLocation?.name,
        full.deliveryLocation?.address,
        full.addressDetail?.trim(),
      ].filter(Boolean);
      addressLine = parts.length ? parts.join(" · ") : null;
    }

    const staffUrl = appAbsoluteUrlOrNull("/staff");
    const text = formatNewOrderNotifyText({
      orderNumber: full.orderNumber,
      queueNumber: full.queueNumber,
      branchName: full.branch.name,
      fulfillmentType: full.fulfillmentType,
      customerName: full.customerName,
      customerPhone: full.customerPhone,
      addressLine,
      note: full.note,
      items: full.items.map((it) => ({
        name: it.itemName,
        quantity: it.quantity,
        optionsText: it.optionsText,
      })),
      total,
      staffUrl,
    });

    await Promise.allSettled(
      staff.map((s) =>
        s.lineUserId ? linePushText(s.lineUserId, text) : Promise.resolve(),
      ),
    );
  } catch (error) {
    console.error("[line] notifyStaffNewOrder failed", error);
  }
}

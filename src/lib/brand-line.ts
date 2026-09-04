import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { appAbsoluteUrl } from "@/lib/app-url";
import { ADMIN_LINE_LINK_CODE_TTL_MS } from "@/lib/line";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

export type BrandLineCredentials = {
  brandId: string;
  accessToken: string;
  channelSecret: string;
  messagingEnabled: boolean;
};

export async function getBrandLineCredentials(
  brandId: string,
): Promise<BrandLineCredentials | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      lineChannelAccessToken: true,
      lineChannelSecret: true,
      lineMessagingEnabled: true,
    },
  });
  if (!brand) return null;
  const accessToken = brand.lineChannelAccessToken?.trim() || "";
  const channelSecret = brand.lineChannelSecret?.trim() || "";
  if (!accessToken || !channelSecret) return null;
  return {
    brandId: brand.id,
    accessToken,
    channelSecret,
    messagingEnabled: brand.lineMessagingEnabled,
  };
}

export async function isBrandLineMessagingReady(
  brandId: string,
): Promise<boolean> {
  const creds = await getBrandLineCredentials(brandId);
  return Boolean(creds?.messagingEnabled);
}

export function brandLineWebhookUrl(brandId: string): string {
  return appAbsoluteUrl(`/api/line/brand/${brandId}/webhook`);
}

export function verifyBrandLineWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  channelSecret: string,
): boolean {
  if (!signatureHeader || !channelSecret) return false;
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

export async function brandLinePushText(
  brandId: string,
  lineUserId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const creds = await getBrandLineCredentials(brandId);
  if (!creds) {
    return { ok: false, error: "ยังไม่ได้ตั้งค่า LINE Channel ของร้าน" };
  }
  if (!creds.messagingEnabled) {
    return { ok: false, error: "ยังไม่ได้เปิดการแจ้งเตือน LINE ของร้าน" };
  }
  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.accessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      error: errText.slice(0, 300) || `LINE API ${res.status}`,
    };
  }
  return { ok: true };
}

export async function brandLineReplyText(
  brandId: string,
  replyToken: string,
  text: string,
): Promise<void> {
  if (!text.trim()) return;
  const creds = await getBrandLineCredentials(brandId);
  if (!creds) return;
  await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  }).catch(() => undefined);
}

/**
 * Link staff phone to LINE for this brand only (branch-scoped memberships).
 */
export async function tryLinkBrandStaffByPhone(
  brandId: string,
  lineUserId: string,
  rawText: string,
): Promise<{ linked: boolean; reply: string }> {
  const digits = normalizePhone(rawText);
  if (digits.length < 9 || digits.length > 12) {
    return {
      linked: false,
      reply: "ส่งเบอร์โทรพนักงานในระบบ เช่น 0812345678",
    };
  }

  const staffRows = await prisma.staff.findMany({
    where: {
      phone: digits,
      isActive: true,
      branch: { brandId },
    },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (staffRows.length === 0) {
    return {
      linked: false,
      reply: `ไม่พบพนักงานเบอร์ ${digits} ในร้านนี้`,
    };
  }

  // Detach this LINE from any other staff rows, then attach to this phone in this brand
  await prisma.staff.updateMany({
    where: { lineUserId, NOT: { phone: digits } },
    data: { lineUserId: null },
  });
  await prisma.staff.updateMany({
    where: {
      phone: digits,
      branch: { brandId },
    },
    data: { lineUserId },
  });

  const staff = staffRows[0]!;
  const name = staff.name?.trim() || staff.phone;
  const branchNames = [...new Set(staffRows.map((s) => s.branch.name))].join(
    ", ",
  );
  return {
    linked: true,
    reply: [
      "เชื่อมต่อพนักงานสำเร็จ",
      `${name} · ${branchNames}`,
      "จะได้รับการแจ้งเตือนออเดอร์ของสาขาที่ผูกไว้",
    ].join("\n"),
  };
}

/**
 * Link brand OWNER/MANAGER admin via 6-digit code (brand OA).
 */
export async function tryLinkBrandAdminByLinkCode(
  brandId: string,
  lineUserId: string,
  rawText: string,
): Promise<{ linked: boolean; reply: string }> {
  const codeMatch = rawText.trim().match(/\b(\d{6})\b/);
  const code = codeMatch?.[1] ?? "";
  if (!code) {
    return {
      linked: false,
      reply: "ส่งรหัส 6 หลักจากหน้าตั้งค่าแจ้งเตือน LINE ของร้าน",
    };
  }

  const now = new Date();
  const admin = await prisma.admin.findFirst({
    where: {
      lineLinkCode: code,
      lineLinkCodeExpiresAt: { gt: now },
      brandMembers: {
        some: {
          brandId,
          role: { in: ["OWNER", "MANAGER"] },
        },
      },
    },
    select: {
      id: true,
      username: true,
      brandMembers: {
        where: { brandId, role: { in: ["OWNER", "MANAGER"] } },
        select: { role: true, brand: { select: { name: true } } },
      },
    },
  });

  if (!admin) {
    return {
      linked: false,
      reply:
        "รหัสไม่ถูกต้องหรือหมดอายุ / ไม่ใช่เจ้าของร้านนี้\nสร้างรหัสใหม่จากตั้งค่าแจ้งเตือน",
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
      lineNotifyEnabled: true,
    },
  });

  const brandName = admin.brandMembers[0]?.brand.name ?? "ร้าน";
  return {
    linked: true,
    reply: [
      "เชื่อมต่อเจ้าของ/ผู้จัดการสำเร็จ",
      `${admin.username} · ${brandName}`,
      "จะได้รับการแจ้งเตือนออเดอร์ตามที่เปิดไว้",
    ].join("\n"),
  };
}

export { ADMIN_LINE_LINK_CODE_TTL_MS };

export const BRAND_LINE_FOLLOW_REPLY = [
  "ยินดีต้อนรับสู่ LINE แจ้งเตือนร้าน",
  "",
  "พนักงาน: พิมพ์เบอร์โทรในระบบ เช่น 0812345678",
  "เจ้าของ/ผู้จัดการ: ส่งรหัส 6 หลักจากหน้าตั้งค่าแจ้งเตือน",
].join("\n");

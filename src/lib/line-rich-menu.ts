import { createElement } from "react";
import { ImageResponse } from "next/og";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getLineCredentials,
  linkRichMenuToUser,
  unlinkRichMenuFromUser,
} from "@/lib/line";
import { LINE_POSTBACK } from "@/lib/line-postback";

const COMPACT_W = 2500;
const COMPACT_H = 843;
const FULL_W = 2500;
const FULL_H = 1686;

function menuCell(
  title: string,
  subtitle: string,
  bg: string,
  width: number,
  height: number,
  fontSize = 48,
  icon?: string,
) {
  return createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width,
        height,
        backgroundColor: bg,
        color: "#ffffff",
      },
    },
    icon
      ? createElement(
          "div",
          {
            style: {
              fontSize: Math.round(fontSize * 1.15),
              marginBottom: 12,
              lineHeight: 1,
            },
          },
          icon,
        )
      : null,
    createElement("div", { style: { fontSize, fontWeight: 700 } }, title),
    createElement(
      "div",
      {
        style: {
          fontSize: Math.round(fontSize * 0.5),
          marginTop: 10,
          opacity: 0.92,
        },
      },
      subtitle,
    ),
  );
}

async function pngFromCells(
  width: number,
  height: number,
  cells: ReturnType<typeof menuCell>[],
): Promise<Buffer> {
  const res = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          display: "flex",
          flexWrap: "wrap",
          width,
          height,
          backgroundColor: "#0f172a",
        },
      },
      ...cells,
    ),
    { width, height },
  );
  return Buffer.from(await res.arrayBuffer());
}

async function generateGuestRichMenuPng(): Promise<Buffer> {
  const cw = COMPACT_W / 2;
  const ch = COMPACT_H;
  return pngFromCells(COMPACT_W, COMPACT_H, [
    menuCell("เข้าสู่ระบบ", "พิมพ์รหัส 6 หลัก", "#1d4ed8", cw, ch, 56, "🔑"),
    menuCell("ช่วยเหลือ", "วิธีเชื่อมบัญชี", "#334155", cw, ch, 56, "❓"),
  ]);
}

async function generateAdminRichMenuPng(): Promise<Buffer> {
  const cw = FULL_W / 2;
  const ch = FULL_H / 3;
  return pngFromCells(FULL_W, FULL_H, [
    menuCell("เปิดแจ้งเตือน", "รับสรุปรอบขาย", "#047857", cw, ch, 44, "🔔"),
    menuCell("ปิดแจ้งเตือน", "หยุดแจ้งเตือน", "#b45309", cw, ch, 44, "🔕"),
    menuCell("ลบออเดอร์", "โหมดลบถาวร", "#b91c1c", cw, ch, 44, "🗑"),
    menuCell("ข้อมูล", "สถานะบัญชี", "#0f766e", cw, ch, 44, "ℹ"),
    menuCell("ออกจากระบบ", "ยกเลิกการเชื่อม", "#7f1d1d", cw, ch, 44, "↩"),
    menuCell("แก้ไขออเดอร์", "แก้เมนู/จำนวน", "#1e3a8a", cw, ch, 44, "✎"),
  ]);
}

function guestRichMenuBody() {
  const w = COMPACT_W;
  const h = COMPACT_H;
  const hw = Math.floor(w / 2);
  return {
    size: { width: w, height: h },
    selected: true,
    name: "guest-menu",
    chatBarText: "เมนู",
    areas: [
      {
        bounds: { x: 0, y: 0, width: hw, height: h },
        action: {
          type: "postback",
          data: LINE_POSTBACK.LOGIN,
          displayText: "เข้าสู่ระบบ",
        },
      },
      {
        bounds: { x: hw, y: 0, width: w - hw, height: h },
        action: {
          type: "postback",
          data: LINE_POSTBACK.GUEST_HELP,
          displayText: "ช่วยเหลือ",
        },
      },
    ],
  };
}

function adminRichMenuBody() {
  const w = FULL_W;
  const h = FULL_H;
  const hw = Math.floor(w / 2);
  const hh = Math.floor(h / 3);
  const rows = [
    [
      LINE_POSTBACK.NOTIFY_ON,
      "เปิดแจ้งเตือน",
      LINE_POSTBACK.NOTIFY_OFF,
      "ปิดแจ้งเตือน",
    ],
    [
      LINE_POSTBACK.MODE_DELETE,
      "ลบออเดอร์",
      LINE_POSTBACK.INFO,
      "ดูข้อมูล",
    ],
    [
      LINE_POSTBACK.LOGOUT,
      "ออกจากระบบ",
      LINE_POSTBACK.MODE_EDIT,
      "แก้ไขออเดอร์",
    ],
  ] as const;

  const areas = [];
  for (let r = 0; r < 3; r++) {
    const y = r * hh;
    const rowH = r === 2 ? h - 2 * hh : hh;
    const [leftData, leftLabel, rightData, rightLabel] = rows[r]!;
    areas.push(
      {
        bounds: { x: 0, y, width: hw, height: rowH },
        action: {
          type: "postback" as const,
          data: leftData,
          displayText: leftLabel,
        },
      },
      {
        bounds: { x: hw, y, width: w - hw, height: rowH },
        action: {
          type: "postback" as const,
          data: rightData,
          displayText: rightLabel,
        },
      },
    );
  }

  return {
    size: { width: w, height: h },
    selected: true,
    name: "admin-menu",
    chatBarText: "เมนูแอดมิน",
    areas,
  };
}

async function deleteRichMenu(richMenuId: string, accessToken: string) {
  await fetch(
    `https://api.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  ).catch(() => undefined);
}

async function createRichMenuWithImage(
  accessToken: string,
  body: unknown,
  png: Buffer,
): Promise<string> {
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new Error(
      text.slice(0, 400) || `สร้าง rich menu ไม่สำเร็จ (${createRes.status})`,
    );
  }
  const created = (await createRes.json()) as { richMenuId?: string };
  const richMenuId = created.richMenuId?.trim();
  if (!richMenuId) throw new Error("LINE ไม่คืน richMenuId");

  const uploadRes = await fetch(
    `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`,
    {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        Authorization: `Bearer ${accessToken}`,
      },
      body: new Uint8Array(png),
    },
  );
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    await deleteRichMenu(richMenuId, accessToken);
    throw new Error(
      text.slice(0, 400) || `อัปโหลดรูปเมนูไม่สำเร็จ (${uploadRes.status})`,
    );
  }
  return richMenuId;
}

async function setDefaultRichMenu(accessToken: string, richMenuId: string) {
  const res = await fetch(
    `https://api.line.me/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text.slice(0, 400) || `ตั้งเมนูเริ่มต้นไม่สำเร็จ (${res.status})`,
    );
  }
}

/** @deprecated use deployLineRichMenus */
export async function deployAdminRichMenu() {
  return deployLineRichMenus();
}

export async function deployLineRichMenus(): Promise<{
  adminRichMenuId: string;
  guestRichMenuId: string;
  linkedAdmins: number;
  errors: string[];
}> {
  const creds = await getLineCredentials();
  if (!creds) {
    throw new Error("ยังไม่ได้ตั้งค่า LINE Channel");
  }

  const [guestPng, adminPng] = await Promise.all([
    generateGuestRichMenuPng(),
    generateAdminRichMenuPng(),
  ]);

  const guestRichMenuId = await createRichMenuWithImage(
    creds.accessToken,
    guestRichMenuBody(),
    guestPng,
  );
  const adminRichMenuId = await createRichMenuWithImage(
    creds.accessToken,
    adminRichMenuBody(),
    adminPng,
  );

  await setDefaultRichMenu(creds.accessToken, guestRichMenuId);

  const prev = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: { lineAdminRichMenuId: true, lineGuestRichMenuId: true },
  });

  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {
      lineAdminRichMenuId: adminRichMenuId,
      lineGuestRichMenuId: guestRichMenuId,
    },
    create: {
      id: "default",
      lineAdminRichMenuId: adminRichMenuId,
      lineGuestRichMenuId: guestRichMenuId,
    },
  });

  if (
    prev?.lineAdminRichMenuId &&
    prev.lineAdminRichMenuId !== adminRichMenuId
  ) {
    await deleteRichMenu(prev.lineAdminRichMenuId, creds.accessToken);
  }
  if (
    prev?.lineGuestRichMenuId &&
    prev.lineGuestRichMenuId !== guestRichMenuId
  ) {
    await deleteRichMenu(prev.lineGuestRichMenuId, creds.accessToken);
  }

  const linkResult = await linkAdminRichMenuToAllLinkedAdmins(adminRichMenuId);
  return {
    adminRichMenuId,
    guestRichMenuId,
    linkedAdmins: linkResult.linked,
    errors: linkResult.errors,
  };
}

export async function linkAdminRichMenuToAllLinkedAdmins(
  richMenuId?: string,
): Promise<{ linked: number; errors: string[] }> {
  const id =
    richMenuId ??
    (
      await prisma.siteSettings.findUnique({
        where: { id: "default" },
        select: { lineAdminRichMenuId: true },
      })
    )?.lineAdminRichMenuId;

  if (!id) {
    return { linked: 0, errors: ["ยังไม่มี rich menu — กดสร้างเมนูก่อน"] };
  }

  const admins = await prisma.admin.findMany({
    where: { lineUserId: { not: null } },
    select: { lineUserId: true, username: true },
  });

  let linked = 0;
  const errors: string[] = [];
  for (const admin of admins) {
    if (!admin.lineUserId) continue;
    const result = await linkRichMenuToUser(admin.lineUserId, id);
    if (result.ok) linked += 1;
    else errors.push(`${admin.username}: ${result.error ?? "ลิงก์ไม่สำเร็จ"}`);
  }
  return { linked, errors };
}

export async function logoutAdminLineLink(
  adminId: string,
  lineUserId: string,
): Promise<void> {
  await prisma.admin.update({
    where: { id: adminId },
    data: {
      lineUserId: null,
      linePendingDeleteOrderId: null,
      linePendingDeleteExpiresAt: null,
      lineDeleteModeExpiresAt: null,
      lineEditModeExpiresAt: null,
      lineEditSession: Prisma.DbNull,
    },
  });
  await unlinkRichMenuFromUser(lineUserId).catch(() => undefined);
}

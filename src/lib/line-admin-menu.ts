import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  confirmPendingDelete,
  clearPendingDelete,
  findLinkedAdmin,
  isPendingDeleteActive,
  type LinkedAdmin,
} from "@/lib/line-order-delete";
import {
  clearEditMode,
  enterEditMode,
  exitEditMode,
  handleEditPostback,
  isEditModeActive,
} from "@/lib/line-order-edit";
import { logLineAdminActivity } from "@/lib/line-activity";
import { logoutAdminLineLink } from "@/lib/line-rich-menu";
import {
  LINE_ADMIN_HELP_TEXT,
  LINE_DELETE_MODE_TTL_MS,
  LINE_LOGIN_INSTRUCTIONS,
  LINE_POSTBACK,
  type LineReplyPayload,
} from "@/lib/line-postback";

async function setNotify(
  admin: LinkedAdmin,
  enabled: boolean,
): Promise<LineReplyPayload> {
  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lineNotifyEnabled: enabled,
      lineNotifyDailySummary: enabled,
    },
  });
  await logLineAdminActivity(admin, {
    action: enabled ? "line.notify.enable" : "line.notify.disable",
    summary: enabled
      ? `เปิดแจ้งเตือน LINE (ผ่านแชท) — ${admin.username}`
      : `ปิดแจ้งเตือน LINE (ผ่านแชท) — ${admin.username}`,
  });
  return {
    text: enabled
      ? "เปิดรับแจ้งเตือน LINE แล้ว (สรุปรอบขาย)"
      : "ปิดรับแจ้งเตือน LINE แล้ว",
  };
}

async function enterDeleteMode(admin: LinkedAdmin): Promise<LineReplyPayload> {
  await clearEditMode(admin.id);
  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lineDeleteModeExpiresAt: new Date(Date.now() + LINE_DELETE_MODE_TTL_MS),
      linePendingDeleteOrderId: null,
      linePendingDeleteExpiresAt: null,
    },
  });
  await logLineAdminActivity(admin, {
    action: "line.delete_mode.enter",
    summary: `เข้าโหมดลบออเดอร์ผ่าน LINE — ${admin.username}`,
  });
  return {
    text: [
      "เข้าโหมดลบออเดอร์แล้ว (30 นาที)",
      "พิมพ์เลขที่ออเดอร์ เช่น A1048",
      "ระบบจะโชว์รายละเอียดแล้วให้กดยืนยัน",
      "พิมพ์ ยกเลิกโหมด เพื่อออก",
    ].join("\n"),
    quickReply: [
      {
        label: "ออกโหมดลบ",
        data: LINE_POSTBACK.MODE_EXIT,
        displayText: "ออกโหมดลบ",
      },
    ],
  };
}

async function exitAllModes(admin: LinkedAdmin): Promise<LineReplyPayload> {
  const wasEdit = isEditModeActive(admin) || Boolean(admin.lineEditSession);
  const wasDelete =
    Boolean(admin.lineDeleteModeExpiresAt) &&
    (admin.lineDeleteModeExpiresAt?.getTime() ?? 0) >= Date.now();

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lineDeleteModeExpiresAt: null,
      linePendingDeleteOrderId: null,
      linePendingDeleteExpiresAt: null,
      lineEditModeExpiresAt: null,
      lineEditSession: Prisma.DbNull,
    },
  });

  if (wasEdit) {
    await logLineAdminActivity(admin, {
      action: "line.edit_mode.exit",
      summary: `ออกจากโหมดแก้ไขผ่าน LINE — ${admin.username}`,
    });
    return { text: "ออกจากโหมดแก้ไขแล้ว" };
  }
  if (wasDelete) {
    await logLineAdminActivity(admin, {
      action: "line.delete_mode.exit",
      summary: `ออกจากโหมดลบผ่าน LINE — ${admin.username}`,
    });
    return { text: "ออกจากโหมดลบแล้ว" };
  }
  return { text: "ไม่มีโหมดที่เปิดอยู่" };
}

async function infoReply(admin: LinkedAdmin): Promise<LineReplyPayload> {
  const full = await prisma.admin.findUnique({
    where: { id: admin.id },
    select: {
      username: true,
      isPlatformAdmin: true,
      lineNotifyEnabled: true,
      lineNotifyDailySummary: true,
      lineDeleteModeExpiresAt: true,
      lineEditModeExpiresAt: true,
      brandMembers: {
        where: { role: { in: ["OWNER", "MANAGER"] } },
        select: {
          role: true,
          brand: { select: { name: true } },
        },
      },
    },
  });

  const brands =
    full?.brandMembers.map(
      (m) => `${m.brand.name} (${m.role === "OWNER" ? "เจ้าของ" : "ผู้จัดการ"})`,
    ) ?? [];
  const notifyOn =
    (full?.lineNotifyEnabled ?? admin.lineNotifyEnabled) ||
    (full?.lineNotifyDailySummary ?? admin.lineNotifyDailySummary);
  const deleteOn =
    Boolean(full?.lineDeleteModeExpiresAt) &&
    (full?.lineDeleteModeExpiresAt?.getTime() ?? 0) >= Date.now();
  const editOn =
    Boolean(full?.lineEditModeExpiresAt) &&
    (full?.lineEditModeExpiresAt?.getTime() ?? 0) >= Date.now();

  await logLineAdminActivity(admin, {
    action: "line.info",
    summary: `ดูข้อมูลบัญชีผ่าน LINE — ${admin.username}`,
  });

  return {
    text: [
      "ข้อมูลบัญชี LINE",
      `ผู้ใช้: ${full?.username ?? admin.username}`,
      full?.isPlatformAdmin ? "บทบาท: แพลตฟอร์มแอดมิน" : null,
      brands.length ? `แบรนด์: ${brands.join(", ")}` : "แบรนด์: —",
      `แจ้งเตือน: ${notifyOn ? "เปิด" : "ปิด"}`,
      `โหมดลบ: ${deleteOn ? "เปิดอยู่" : "ปิด"}`,
      `โหมดแก้ไข: ${editOn ? "เปิดอยู่" : "ปิด"}`,
      "",
      "พิมพ์ ช่วยเหลือ เพื่อดูวิธีใช้",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function logoutReply(
  admin: LinkedAdmin,
  lineUserId: string,
): Promise<LineReplyPayload> {
  await logLineAdminActivity(admin, {
    action: "line.unlink",
    summary: `ออกจากระบบ LINE (ยกเลิกเชื่อม) — ${admin.username}`,
    metadata: { source: "line_menu_logout" },
  });
  await logoutAdminLineLink(admin.id, lineUserId);
  return {
    text: [
      "ออกจากระบบแล้ว",
      "ยกเลิกการเชื่อม LINE กับบัญชีแอดมินนี้แล้ว",
      "",
      "เข้าใหม่: กดเข้าสู่ระบบแล้วทำตามขั้นตอน",
    ].join("\n"),
    quickReply: [
      {
        label: "เข้าสู่ระบบ",
        data: LINE_POSTBACK.LOGIN,
        displayText: "เข้าสู่ระบบ",
      },
    ],
  };
}

function helpReply(admin: LinkedAdmin): LineReplyPayload {
  const notifyOn = admin.lineNotifyEnabled || admin.lineNotifyDailySummary;
  void logLineAdminActivity(admin, {
    action: "line.help",
    summary: `เปิดช่วยเหลือผ่าน LINE — ${admin.username}`,
  });
  return {
    text: [
      LINE_ADMIN_HELP_TEXT,
      "",
      `สถานะแจ้งเตือน: ${notifyOn ? "เปิด" : "ปิด"}`,
      `โหมดลบ: ${
        admin.lineDeleteModeExpiresAt &&
        admin.lineDeleteModeExpiresAt.getTime() >= Date.now()
          ? "เปิดอยู่"
          : "ปิด"
      }`,
      `โหมดแก้ไข: ${
        admin.lineEditModeExpiresAt &&
        admin.lineEditModeExpiresAt.getTime() >= Date.now()
          ? "เปิดอยู่"
          : "ปิด"
      }`,
    ].join("\n"),
    quickReply: [
      {
        label: notifyOn ? "ปิดแจ้งเตือน" : "เปิดแจ้งเตือน",
        data: notifyOn ? LINE_POSTBACK.NOTIFY_OFF : LINE_POSTBACK.NOTIFY_ON,
      },
      { label: "โหมดลบ", data: LINE_POSTBACK.MODE_DELETE },
      { label: "แก้ไขออเดอร์", data: LINE_POSTBACK.MODE_EDIT },
      { label: "ดูข้อมูล", data: LINE_POSTBACK.INFO },
      { label: "ออกจากระบบ", data: LINE_POSTBACK.LOGOUT },
    ],
  };
}

function loginInstructions(alreadyLinked: boolean): LineReplyPayload {
  if (alreadyLinked) {
    return {
      text: [
        "บัญชีนี้เชื่อมแอดมินอยู่แล้ว",
        "ถ้าต้องการเปลี่ยนบัญชี กดออกจากระบบก่อน แล้วเข้าสู่ระบบใหม่",
      ].join("\n"),
      quickReply: [
        { label: "ดูข้อมูล", data: LINE_POSTBACK.INFO },
        { label: "ออกจากระบบ", data: LINE_POSTBACK.LOGOUT },
      ],
    };
  }
  return { text: LINE_LOGIN_INSTRUCTIONS };
}

/**
 * Handle rich-menu / quick-reply postbacks (admin + guest login).
 */
export async function tryHandleLineAdminPostback(
  lineUserId: string,
  data: string,
): Promise<{ handled: boolean; reply: LineReplyPayload }> {
  const payload = data.trim();
  if (!payload.startsWith("admin:") && !payload.startsWith("guest:")) {
    return { handled: false, reply: { text: "" } };
  }

  const admin = await findLinkedAdmin(lineUserId);

  if (payload === LINE_POSTBACK.LOGIN || payload === LINE_POSTBACK.GUEST_HELP) {
    if (payload === LINE_POSTBACK.GUEST_HELP) {
      return {
        handled: true,
        reply: {
          text: admin
            ? [
                LINE_ADMIN_HELP_TEXT,
                "",
                "กดเมนูแอดมินด้านล่างเพื่อใช้งาน",
              ].join("\n")
            : [
                LINE_LOGIN_INSTRUCTIONS,
                "",
                "หลังเชื่อมสำเร็จจะเห็นเมนูแอดมินอัตโนมัติ",
              ].join("\n"),
        },
      };
    }
    return {
      handled: true,
      reply: loginInstructions(Boolean(admin)),
    };
  }

  if (!admin) {
    return {
      handled: true,
      reply: {
        text: [
          "ยังไม่ได้เข้าสู่ระบบแอดมิน",
          "",
          LINE_LOGIN_INSTRUCTIONS,
        ].join("\n"),
        quickReply: [
          {
            label: "เข้าสู่ระบบ",
            data: LINE_POSTBACK.LOGIN,
            displayText: "เข้าสู่ระบบ",
          },
        ],
      },
    };
  }

  if (
    payload === LINE_POSTBACK.HELP ||
    payload === "admin:help"
  ) {
    return { handled: true, reply: helpReply(admin) };
  }

  const editReply = await handleEditPostback(admin, payload);
  if (editReply) {
    return { handled: true, reply: editReply };
  }

  switch (payload) {
    case LINE_POSTBACK.NOTIFY_ON:
      return { handled: true, reply: await setNotify(admin, true) };
    case LINE_POSTBACK.NOTIFY_OFF:
      return { handled: true, reply: await setNotify(admin, false) };
    case LINE_POSTBACK.MODE_DELETE:
      return { handled: true, reply: await enterDeleteMode(admin) };
    case LINE_POSTBACK.MODE_EXIT:
      return { handled: true, reply: await exitAllModes(admin) };
    case LINE_POSTBACK.INFO:
      return { handled: true, reply: await infoReply(admin) };
    case LINE_POSTBACK.LOGOUT:
      return { handled: true, reply: await logoutReply(admin, lineUserId) };
    case LINE_POSTBACK.DELETE_CONFIRM: {
      if (!isPendingDeleteActive(admin)) {
        return {
          handled: true,
          reply: { text: "ไม่มีรายการรอยืนยันลบ\nพิมพ์เลขที่ออเดอร์ก่อน" },
        };
      }
      return { handled: true, reply: await confirmPendingDelete(admin) };
    }
    case LINE_POSTBACK.DELETE_CANCEL: {
      await clearPendingDelete(admin.id);
      await logLineAdminActivity(admin, {
        action: "line.delete_mode.exit",
        summary: `ยกเลิกรายการรอยืนยันลบผ่าน LINE — ${admin.username}`,
        metadata: { cancelledPendingDelete: true },
      });
      return { handled: true, reply: { text: "ยกเลิกการลบออเดอร์แล้ว" } };
    }
    default:
      return {
        handled: true,
        reply: { text: "ไม่รู้จักคำสั่งเมนูนี้" },
      };
  }
}

// keep export for callers that imported exitEditMode path via menu
export { enterEditMode, exitEditMode };

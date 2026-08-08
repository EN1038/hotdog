/** Shared LINE reply / postback constants (no DB). */

export const LINE_POSTBACK = {
  NOTIFY_ON: "admin:notify:on",
  NOTIFY_OFF: "admin:notify:off",
  MODE_DELETE: "admin:mode:delete",
  MODE_EXIT: "admin:mode:exit",
  HELP: "admin:help",
  INFO: "admin:info",
  LOGOUT: "admin:logout",
  LOGIN: "guest:login",
  GUEST_HELP: "guest:help",
  DELETE_CONFIRM: "admin:delete:confirm",
  DELETE_CANCEL: "admin:delete:cancel",
} as const;

export type LineQuickReplyItem = {
  label: string;
  data: string;
  displayText?: string;
};

export type LineReplyPayload = {
  text: string;
  quickReply?: LineQuickReplyItem[];
};

export const LINE_DELETE_MODE_TTL_MS = 30 * 60 * 1000;

export const LINE_LOGIN_INSTRUCTIONS = [
  "เข้าสู่ระบบผ่าน LINE",
  "",
  "แอดมิน / เจ้าของแบรนด์:",
  "1) เปิดเว็บแอดมิน → เมนูเชื่อม LINE",
  "2) กดสร้างรหัส 6 หลัก",
  "3) พิมพ์รหัส 6 หลักในแชทนี้ภายใน 10 นาที",
  "",
  "พนักงาน:",
  "พิมพ์เบอร์โทรในระบบ เช่น 0812345678",
].join("\n");

export const LINE_ADMIN_HELP_TEXT = [
  "เมนูแอดมิน LINE",
  "• เปิด/ปิดแจ้งเตือน — รับหรือหยุดสรุปรอบขาย",
  "• โหมดลบ — พิมพ์เลขที่ เช่น A1048 แล้วกดยืนยัน",
  "• ดูข้อมูล — ดูสถานะบัญชีที่เชื่อมอยู่",
  "• ออกจากระบบ — ยกเลิกการเชื่อม LINE นี้",
  "• หรือพิมพ์ ลบ A1048 ได้โดยไม่เข้าโหมดลบ",
].join("\n");

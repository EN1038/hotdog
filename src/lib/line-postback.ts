/** Shared LINE reply / postback constants (no DB). */

export const LINE_POSTBACK = {
  NOTIFY_ON: "admin:notify:on",
  NOTIFY_OFF: "admin:notify:off",
  MODE_DELETE: "admin:mode:delete",
  MODE_EDIT: "admin:mode:edit",
  MODE_EXIT: "admin:mode:exit",
  HELP: "admin:help",
  INFO: "admin:info",
  LOGOUT: "admin:logout",
  LOGIN: "guest:login",
  GUEST_HELP: "guest:help",
  DELETE_CONFIRM: "admin:delete:confirm",
  DELETE_CANCEL: "admin:delete:cancel",
  EDIT_ADD: "admin:edit:add",
  EDIT_LINE: "admin:edit:line",
  EDIT_DELETE_LINE: "admin:edit:del_line",
  EDIT_SAVE: "admin:edit:save",
  EDIT_CANCEL: "admin:edit:cancel",
  EDIT_CONFIRM: "admin:edit:confirm",
  EDIT_NEXT: "admin:edit:next",
  EDIT_PREV: "admin:edit:prev",
  EDIT_SKIP_OPTS: "admin:edit:skip_opts",
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
export const LINE_EDIT_MODE_TTL_MS = 30 * 60 * 1000;
export const LINE_EDIT_SESSION_TTL_MS = 15 * 60 * 1000;

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
  "• ลบออเดอร์ — พิมพ์เลขที่ เช่น A1048 แล้วกดยืนยัน",
  "• แก้ไขออเดอร์ — พิมพ์เลขที่ แล้วเพิ่ม/แก้/ลบรายการเมนู",
  "• ดูข้อมูล — ดูสถานะบัญชีที่เชื่อมอยู่",
  "• ออกจากระบบ — ยกเลิกการเชื่อม LINE นี้",
  "• ทางลัด: ลบ A1048 / แก้ไข A1048",
  "• พิมพ์ ช่วยเหลือ เพื่อดูข้อความนี้",
].join("\n");

import { SmsSendPurpose, SmsSendStatus } from "@prisma/client";

export const SMS_SEND_PURPOSE_LABELS: Record<SmsSendPurpose, string> = {
  SKEWER_ORDER_CONFIRMED: "ยืนยันออเดอร์เสียบไม้",
  SKEWER_ORDER_CANCELLED: "ยกเลิกออเดอร์เสียบไม้",
};

export const SMS_SEND_STATUS_LABELS: Record<SmsSendStatus, string> = {
  SENT: "ส่งแล้ว",
  FAILED: "ล้มเหลว",
  SKIPPED: "ข้าม",
};

export const SMS_SEND_PURPOSE_OPTIONS = (
  Object.keys(SMS_SEND_PURPOSE_LABELS) as SmsSendPurpose[]
).map((value) => ({ value, label: SMS_SEND_PURPOSE_LABELS[value] }));

export const SMS_SEND_STATUS_OPTIONS = (
  Object.keys(SMS_SEND_STATUS_LABELS) as SmsSendStatus[]
).map((value) => ({ value, label: SMS_SEND_STATUS_LABELS[value] }));

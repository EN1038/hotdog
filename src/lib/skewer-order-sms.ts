import { SmsSendPurpose, SmsSendStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  isTaximailSmsConfigured,
  taximailSendSms,
  toMsisdn,
} from "@/lib/taximail";

export type SkewerOrderSmsTarget = {
  id: string;
  orderNumber: string;
  customerPhone: string;
  branchId: string;
};

export type SkewerOrderSmsOpts = {
  brandId?: string | null;
  triggeredByAdminId?: string | null;
};

function confirmedBody(orderNumber: string) {
  return `ออเดอร์ #${orderNumber} ยืนยันแล้ว ดูรายละเอียดในแอป`;
}

function cancelledBody(orderNumber: string) {
  return `ออเดอร์ #${orderNumber} ถูกยกเลิกแล้ว ดูรายละเอียดในแอป`;
}

async function writeSmsLog(data: {
  purpose: SmsSendPurpose;
  status: SmsSendStatus;
  toPhone: string;
  toMsisdn: string;
  body: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  brandId?: string | null;
  branchId: string;
  skewerOrderId: string;
  orderNumber: string;
  triggeredByAdminId?: string | null;
}) {
  try {
    await prisma.smsSendLog.create({
      data: {
        purpose: data.purpose,
        status: data.status,
        toPhone: data.toPhone,
        toMsisdn: data.toMsisdn,
        body: data.body,
        provider: "taximail",
        providerMessageId: data.providerMessageId ?? null,
        errorMessage: data.errorMessage ?? null,
        brandId: data.brandId ?? null,
        branchId: data.branchId,
        skewerOrderId: data.skewerOrderId,
        orderNumber: data.orderNumber,
        triggeredByAdminId: data.triggeredByAdminId ?? null,
      },
    });
  } catch (error) {
    console.error("[skewer-sms] failed to write SmsSendLog", error);
  }
}

async function notifySkewerOrderSms(
  order: SkewerOrderSmsTarget,
  purpose: SmsSendPurpose,
  body: string,
  opts: SkewerOrderSmsOpts = {},
) {
  const toPhone = normalizePhone(order.customerPhone ?? "");
  const toMsisdnValue = toPhone ? toMsisdn(toPhone) : "";

  const base = {
    purpose,
    toPhone,
    toMsisdn: toMsisdnValue,
    body,
    brandId: opts.brandId,
    branchId: order.branchId,
    skewerOrderId: order.id,
    orderNumber: order.orderNumber,
    triggeredByAdminId: opts.triggeredByAdminId,
  };

  if (!toPhone) {
    await writeSmsLog({
      ...base,
      status: SmsSendStatus.SKIPPED,
      errorMessage: "ไม่มีเบอร์ลูกค้า",
    });
    return;
  }

  if (!isTaximailSmsConfigured()) {
    await writeSmsLog({
      ...base,
      status: SmsSendStatus.SKIPPED,
      errorMessage: "ยังไม่ได้ตั้งค่า Taximail API key/secret",
    });
    return;
  }

  try {
    const sent = await taximailSendSms({ to: toPhone, text: body });
    await writeSmsLog({
      ...base,
      status: SmsSendStatus.SENT,
      providerMessageId: sent.messageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ส่ง SMS ไม่สำเร็จ";
    console.error("[skewer-sms] send failed", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      purpose,
      message,
    });
    await writeSmsLog({
      ...base,
      status: SmsSendStatus.FAILED,
      errorMessage: message.slice(0, 500),
    });
  }
}

export async function notifyCustomerSkewerOrderConfirmed(
  order: SkewerOrderSmsTarget,
  opts: SkewerOrderSmsOpts = {},
) {
  try {
    await notifySkewerOrderSms(
      order,
      SmsSendPurpose.SKEWER_ORDER_CONFIRMED,
      confirmedBody(order.orderNumber),
      opts,
    );
  } catch (error) {
    console.error("[skewer-sms] confirm notify crashed", error);
  }
}

export async function notifyCustomerSkewerOrderCancelled(
  order: SkewerOrderSmsTarget,
  opts: SkewerOrderSmsOpts = {},
) {
  try {
    await notifySkewerOrderSms(
      order,
      SmsSendPurpose.SKEWER_ORDER_CANCELLED,
      cancelledBody(order.orderNumber),
      opts,
    );
  } catch (error) {
    console.error("[skewer-sms] cancel notify crashed", error);
  }
}

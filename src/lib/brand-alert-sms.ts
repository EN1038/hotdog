import { SmsSendPurpose, SmsSendStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { brandHasSmsQuota } from "@/lib/brand-sms-quota";
import {
  isTaximailSmsConfigured,
  taximailSendSms,
  toMsisdn,
} from "@/lib/taximail";

type AlertContext = {
  brandId: string;
  branchId: string;
  branchName: string;
  orderNumber: string;
  purpose: Extract<
    SmsSendPurpose,
    "BRAND_ALERT_NEW_ORDER" | "BRAND_ALERT_SKEWER_ORDER"
  >;
  extraLine?: string | null;
};

async function writeLog(data: {
  purpose: SmsSendPurpose;
  status: SmsSendStatus;
  toPhone: string;
  toMsisdn: string;
  body: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  brandId: string;
  branchId: string;
  orderNumber: string;
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
        brandId: data.brandId,
        branchId: data.branchId,
        orderNumber: data.orderNumber,
      },
    });
  } catch (error) {
    console.error("[brand-alert-sms] failed to write SmsSendLog", error);
  }
}

function buildBody(ctx: AlertContext): string {
  const label =
    ctx.purpose === "BRAND_ALERT_SKEWER_ORDER"
      ? "สั่งเสียบไม้ใหม่"
      : "ออเดอร์ลูกค้าใหม่";
  const lines = [
    `[SkillSale] ${label}`,
    `${ctx.branchName} #${ctx.orderNumber}`,
    ctx.extraLine?.trim() || null,
  ].filter(Boolean);
  return lines.join(" ");
}

async function sendBranchAlertSms(
  toPhoneRaw: string,
  ctx: AlertContext,
): Promise<void> {
  const toPhone = normalizePhone(toPhoneRaw);
  if (!toPhone) return;

  const body = buildBody(ctx);

  if (!isTaximailSmsConfigured()) {
    await writeLog({
      purpose: ctx.purpose,
      status: "SKIPPED",
      toPhone,
      toMsisdn: "",
      body,
      errorMessage: "Taximail SMS ยังไม่ตั้งค่า",
      brandId: ctx.brandId,
      branchId: ctx.branchId,
      orderNumber: ctx.orderNumber,
    });
    return;
  }

  if (!(await brandHasSmsQuota(ctx.brandId))) {
    await writeLog({
      purpose: ctx.purpose,
      status: "SKIPPED",
      toPhone,
      toMsisdn: "",
      body,
      errorMessage: "โควตา SMS หมด",
      brandId: ctx.brandId,
      branchId: ctx.branchId,
      orderNumber: ctx.orderNumber,
    });
    return;
  }

  let msisdn = "";
  try {
    msisdn = toMsisdn(toPhone);
    const result = await taximailSendSms({ to: msisdn, text: body });
    await writeLog({
      purpose: ctx.purpose,
      status: "SENT",
      toPhone,
      toMsisdn: msisdn,
      body,
      providerMessageId: result.messageId ?? null,
      brandId: ctx.brandId,
      branchId: ctx.branchId,
      orderNumber: ctx.orderNumber,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ส่ง SMS ไม่สำเร็จ";
    await writeLog({
      purpose: ctx.purpose,
      status: "FAILED",
      toPhone,
      toMsisdn: msisdn,
      body,
      errorMessage: message,
      brandId: ctx.brandId,
      branchId: ctx.branchId,
      orderNumber: ctx.orderNumber,
    });
    console.error("[brand-alert-sms] send failed", {
      branchId: ctx.branchId,
      purpose: ctx.purpose,
      error,
    });
  }
}

export async function notifyBranchSmsNewOrder(input: {
  brandId: string;
  branchId: string;
  branchName: string;
  orderNumber: string;
  customerName?: string | null;
  totalBaht?: number | null;
}): Promise<void> {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
      select: {
        alertSmsPhone: true,
        smsNotifyNewOrder: true,
      },
    });
    if (!branch?.smsNotifyNewOrder || !branch.alertSmsPhone?.trim()) return;

    const extra = [
      input.customerName?.trim() ? `ลูกค้า ${input.customerName.trim()}` : null,
      input.totalBaht != null ? `ยอด ${Math.round(input.totalBaht)} บาท` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    await sendBranchAlertSms(branch.alertSmsPhone, {
      brandId: input.brandId,
      branchId: input.branchId,
      branchName: input.branchName,
      orderNumber: input.orderNumber,
      purpose: "BRAND_ALERT_NEW_ORDER",
      extraLine: extra || null,
    });
  } catch (error) {
    console.error("[brand-alert-sms] notifyBranchSmsNewOrder failed", error);
  }
}

export async function notifyBranchSmsSkewerOrder(input: {
  brandId: string;
  branchId: string;
  branchName: string;
  orderNumber: string;
  customerPhone?: string | null;
  requestedDate?: string | null;
}): Promise<void> {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
      select: {
        alertSmsPhone: true,
        smsNotifySkewerOrder: true,
      },
    });
    if (!branch?.smsNotifySkewerOrder || !branch.alertSmsPhone?.trim()) return;

    const extra = [
      input.customerPhone?.trim()
        ? `เบอร์ ${input.customerPhone.trim()}`
        : null,
      input.requestedDate?.trim()
        ? `วันที่ ${input.requestedDate.trim()}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    await sendBranchAlertSms(branch.alertSmsPhone, {
      brandId: input.brandId,
      branchId: input.branchId,
      branchName: input.branchName,
      orderNumber: input.orderNumber,
      purpose: "BRAND_ALERT_SKEWER_ORDER",
      extraLine: extra || null,
    });
  } catch (error) {
    console.error("[brand-alert-sms] notifyBranchSmsSkewerOrder failed", error);
  }
}

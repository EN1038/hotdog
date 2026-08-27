import { normalizePhone } from "@/lib/constants";

const TAXIMAIL_BASE = "https://api.taximail.com/v2";

export function isTaximailConfigured() {
  return Boolean(
    process.env.TAXIMAIL_API_KEY?.trim() &&
      process.env.TAXIMAIL_SECRET_KEY?.trim() &&
      process.env.TAXIMAIL_OTP_TEMPLATE_KEY?.trim(),
  );
}

/** Transactional SMS (order confirms) — needs API key/secret only. */
export function isTaximailSmsConfigured() {
  return Boolean(
    process.env.TAXIMAIL_API_KEY?.trim() &&
      process.env.TAXIMAIL_SECRET_KEY?.trim(),
  );
}

function requiredTaximailEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า ${name}`);
  return value;
}

/** Thai local 08… → MSISDN 668… */
export function toMsisdn(phone: string): string {
  let digits = normalizePhone(phone);
  if (digits.startsWith("66") && digits.length >= 11) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `66${digits}`;
}

function basicAuthHeader() {
  const key = requiredTaximailEnv("TAXIMAIL_API_KEY");
  const secret = requiredTaximailEnv("TAXIMAIL_SECRET_KEY");
  const token = Buffer.from(`${key}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

function toFormBody(data: Record<string, string | boolean>) {
  return Object.entries(data)
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&");
}

function generateSmsMessageId() {
  return `sms_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function taximailErrorDetail(data: {
  message?: string;
  error?: string;
  err_msg?: string;
}): string {
  return (
    (typeof data.message === "string" && data.message.trim()) ||
    (typeof data.error === "string" && data.error.trim()) ||
    (typeof data.err_msg === "string" && data.err_msg.trim()) ||
    ""
  );
}

export type TaximailOtpSendResult = {
  messageId: string;
  otpRefNo: string | null;
  raw: unknown;
};

export type TaximailSmsSendResult = {
  messageId: string;
  raw: unknown;
};

export async function taximailSendOtp(phone: string): Promise<TaximailOtpSendResult> {
  const templateKey = requiredTaximailEnv("TAXIMAIL_OTP_TEMPLATE_KEY");
  const res = await fetch(`${TAXIMAIL_BASE}/otp`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toFormBody({
      to: toMsisdn(phone),
      sms_template_key: templateKey,
      report_webhook: true,
      generate_link: true,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    code?: number | string;
    message?: string;
    error?: string;
    err_msg?: string;
    err_key?: string;
    data?: {
      message_id?: string;
      messageId?: string;
      otp_ref_no?: string;
      otpRefNo?: string;
    };
  };

  const messageId =
    data.data?.message_id?.trim() || data.data?.messageId?.trim();
  if (!res.ok || !messageId) {
    const errKey =
      (typeof data.err_key === "string" && data.err_key.trim()) || "";
    const detail = taximailErrorDetail(data);
    console.error("[taximail] otp send failed", {
      httpStatus: res.status,
      status: data.status,
      code: data.code,
      errKey,
      message: detail || null,
      body: data,
    });

    if (
      errKey === "not_found_template" ||
      /not found template/i.test(detail)
    ) {
      throw new Error(
        "ไม่พบเทมเพลต OTP ใน Taximail — ตรวจ TAXIMAIL_OTP_TEMPLATE_KEY ให้ตรงกับเทมเพลต SMS OTP ในบัญชี Taximail",
      );
    }

    throw new Error(detail || "ส่งรหัส OTP ไม่สำเร็จ");
  }

  return {
    messageId,
    otpRefNo:
      data.data?.otp_ref_no?.trim() ||
      data.data?.otpRefNo?.trim() ||
      null,
    raw: data,
  };
}

/**
 * Transactional SMS (not OTP). Uses free-text body.
 *
 * Default `generateLink: false` — Thai carriers treat third-party short links
 * as spam; keep the brand domain (`order.skillsale.co`) in the message body.
 */
export async function taximailSendSms(opts: {
  to: string;
  text: string;
  from?: string;
  /** Wrap URLs via Taximail shortener (avoid for branded domains). */
  generateLink?: boolean;
}): Promise<TaximailSmsSendResult> {
  const text = opts.text.trim();
  if (!text) throw new Error("ข้อความ SMS ว่าง");

  const messageId = generateSmsMessageId();
  const from =
    opts.from?.trim() ||
    process.env.TAXIMAIL_SMS_FROM?.trim() ||
    "SkillSale";
  const group = process.env.TAXIMAIL_SMS_GROUP?.trim() || "Default";

  const res = await fetch(`${TAXIMAIL_BASE}/sms`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toFormBody({
      from,
      to: toMsisdn(opts.to),
      text,
      message_id: messageId,
      transactional_group_name: group,
      report_webhook: true,
      generate_link: opts.generateLink === true,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    code?: number | string;
    message?: string;
    error?: string;
    err_msg?: string;
    data?: {
      message_id?: string;
      messageId?: string;
    };
  };

  const providerMessageId =
    data.data?.message_id?.trim() ||
    data.data?.messageId?.trim() ||
    messageId;

  if (!res.ok) {
    const detail = taximailErrorDetail(data);
    console.error("[taximail] sms send failed", {
      httpStatus: res.status,
      status: data.status,
      code: data.code,
      message: detail || null,
      body: data,
    });
    throw new Error(detail || "ส่ง SMS ไม่สำเร็จ");
  }

  if (data.status && data.status !== "success") {
    const detail = taximailErrorDetail(data);
    console.error("[taximail] sms send rejected", {
      status: data.status,
      code: data.code,
      message: detail || null,
      body: data,
    });
    throw new Error(detail || "ส่ง SMS ไม่สำเร็จ");
  }

  return { messageId: providerMessageId, raw: data };
}

export async function taximailVerifyOtp(
  messageId: string,
  otpCode: string,
): Promise<boolean> {
  const url = new URL(
    `${TAXIMAIL_BASE}/otp/verify/${encodeURIComponent(messageId.trim())}`,
  );
  url.searchParams.set("otp_code", otpCode.trim());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: basicAuthHeader(),
    },
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    code?: number;
    message?: string;
  };

  // Taximail n8n node treats status=success && code=202 as valid
  if (data.status === "success" && data.code === 202) return true;
  if (res.ok && data.status === "success") return true;
  return false;
}

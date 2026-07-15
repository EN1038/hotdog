import { normalizePhone } from "@/lib/constants";

const TAXIMAIL_BASE = "https://api.taximail.com/v2";

export function isTaximailConfigured() {
  return Boolean(
    process.env.TAXIMAIL_API_KEY?.trim() &&
      process.env.TAXIMAIL_SECRET_KEY?.trim() &&
      process.env.TAXIMAIL_OTP_TEMPLATE_KEY?.trim(),
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

export type TaximailOtpSendResult = {
  messageId: string;
  otpRefNo: string | null;
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
    code?: number;
    message?: string;
    data?: { message_id?: string; otp_ref_no?: string };
  };

  const messageId = data.data?.message_id?.trim();
  if (!res.ok || !messageId) {
    const msg =
      (typeof data.message === "string" && data.message.trim()) ||
      "ส่งรหัส OTP ไม่สำเร็จ";
    throw new Error(msg);
  }

  return {
    messageId,
    otpRefNo: data.data?.otp_ref_no?.trim() || null,
    raw: data,
  };
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

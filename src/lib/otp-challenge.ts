import { prisma } from "@/lib/db";
import { taximailVerifyOtp } from "@/lib/taximail";

export const OTP_PURPOSES = [
  "customer",
  "staff",
  "owner",
  "owner_register",
] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export type ConsumeOtpResult =
  | { ok: true; pendingName: string | null }
  | { ok: false; message: string; status: number };

/** Verify Taximail OTP and mark the challenge consumed. */
export async function consumeOtpChallenge(opts: {
  phone: string;
  challengeId: string;
  otpCode: string;
  purpose: OtpPurpose;
}): Promise<ConsumeOtpResult> {
  const challenge = await prisma.customerOtpChallenge.findUnique({
    where: { id: opts.challengeId },
  });

  if (
    !challenge ||
    challenge.phone !== opts.phone ||
    challenge.purpose !== opts.purpose
  ) {
    return { ok: false, message: "ไม่พบคำขอรหัส OTP", status: 400 };
  }
  if (challenge.consumedAt) {
    return {
      ok: false,
      message: "รหัสนี้ถูกใช้แล้ว กรุณาขอรหัสใหม่",
      status: 400,
    };
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      message: "รหัสหมดอายุ กรุณาขอรหัสใหม่",
      status: 400,
    };
  }

  const valid = await taximailVerifyOtp(challenge.messageId, opts.otpCode);
  if (!valid) {
    return { ok: false, message: "รหัส OTP ไม่ถูกต้อง", status: 401 };
  }

  await prisma.customerOtpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true, pendingName: challenge.pendingName };
}

export async function markStaffPhoneVerified(phone: string) {
  await prisma.staff.updateMany({
    where: { phone },
    data: { phoneVerifiedAt: new Date() },
  });
}

export async function peerStaffPhoneVerifiedAt(
  phone: string,
  excludeStaffId?: string,
) {
  const peer = await prisma.staff.findFirst({
    where: {
      phone,
      phoneVerifiedAt: { not: null },
      ...(excludeStaffId ? { NOT: { id: excludeStaffId } } : {}),
    },
    select: { phoneVerifiedAt: true },
    orderBy: { phoneVerifiedAt: "desc" },
  });
  return peer?.phoneVerifiedAt ?? null;
}

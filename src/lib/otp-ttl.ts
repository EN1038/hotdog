/** OTP code validity after send */
export const OTP_TTL_MS = 5 * 60_000;
export const OTP_TTL_SECONDS = Math.floor(OTP_TTL_MS / 1000);

/** Wait before requesting another SMS */
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_RESEND_COOLDOWN_SECONDS = Math.floor(
  OTP_RESEND_COOLDOWN_MS / 1000,
);

export function formatOtpCountdown(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

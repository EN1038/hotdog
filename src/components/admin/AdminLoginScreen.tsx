"use client";

import { useEffect, useState } from "react";
import { MerchantAuthShell } from "@/components/MerchantAuthShell";
import { OtpDigitInput, OTP_DIGIT_LENGTH } from "@/components/OtpDigitInput";
import {
  AuthFooterLink,
  AuthHintBanner,
  AuthOwnerLoginHint,
  AuthPasswordField,
  AuthTextField,
  LoginMethodSelector,
  authErrorClass,
  authLabelClass,
} from "@/components/merchant-auth-register-ui";
import {
  RegisterPhoneField,
  RegisterPrimaryButton,
} from "@/components/owner/owner-register-ui";
import {
  OTP_TTL_SECONDS,
  formatOtpCountdown,
} from "@/lib/otp-ttl";
import { assignOwnerViewHome } from "@/lib/owner-view-preference";

export type AdminLoginMode = "owner" | "platform";

const LOGIN_COPY: Record<
  AdminLoginMode,
  { title: string; description: string; usernameLabel: string; hint: string }
> = {
  owner: {
    title: "เข้าใช้งานร้านค้า",
    description: "ใช้เบอร์โทรที่ลงทะเบียนตอนเปิดร้าน",
    usernameLabel: "เบอร์โทร",
    hint: "",
  },
  platform: {
    title: "เข้าใช้งานแพลตฟอร์ม",
    description: "สำหรับทีม SkillSale",
    usernameLabel: "ไอดีแพลตฟอร์ม",
    hint: "หน้านี้สำหรับทีม SkillSale เท่านั้น",
  },
};

export function AdminLoginScreen({ mode = "platform" }: { mode?: AdminLoginMode }) {
  const copy = LOGIN_COPY[mode];
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [ownerMethod, setOwnerMethod] = useState<"otp" | "password">("otp");
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otpRefNo, setOtpRefNo] = useState("");
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!otpStep || otpSecondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setOtpSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [otpStep, otpSecondsLeft]);

  async function loginWithPassword() {
    const res = await fetch("/api/auth/login?type=admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "owner"
          ? { phone, password }
          : { username, password },
      ),
    });
    const text = await res.text();
    let data: { error?: string; isPlatformAdmin?: boolean } = {};
    try {
      data = text ? (JSON.parse(text) as typeof data) : {};
    } catch {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        setError("ระบบล็อกอินขัดข้องชั่วคราว — ลองใหม่ในอีกสักครู่");
      } else {
        setError("เข้าไม่ได้ — ลองใหม่ หรือแจ้งแอดมิน");
      }
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "เบอร์หรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    if (mode === "owner" && !data.isPlatformAdmin) {
      await assignOwnerViewHome();
      return;
    }
    window.location.assign("/admin");
  }

  async function sendOwnerOtp() {
    if (phone.length < 9) {
      setError("กรุณากรอกเบอร์โทรให้ครบ");
      return;
    }
    const res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose: "owner" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "ส่ง OTP ไม่สำเร็จ");
      return;
    }
    setChallengeId(data.challengeId ?? "");
    setOtpRefNo(data.otpRefNo ?? "");
    setOtpSecondsLeft(
      typeof data.expiresIn === "number" ? data.expiresIn : OTP_TTL_SECONDS,
    );
    setOtpStep(true);
    setOtpCode("");
    setError("");
  }

  async function verifyOwnerOtp() {
    if (otpSecondsLeft <= 0) {
      setError("รหัสหมดอายุแล้ว — กดขอรหัสใหม่");
      return;
    }
    const res = await fetch("/api/auth/login?type=admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        challengeId,
        otpCode,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "รหัส OTP ไม่ถูกต้อง");
      return;
    }
    if (data.isPlatformAdmin) {
      window.location.assign("/admin");
      return;
    }
    await assignOwnerViewHome();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "platform") {
        await loginWithPassword();
        return;
      }
      if (ownerMethod === "password") {
        await loginWithPassword();
        return;
      }
      if (!otpStep) {
        await sendOwnerOtp();
        return;
      }
      await verifyOwnerOtp();
    } catch {
      setError("เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  function handleHeaderBack() {
    setOtpStep(false);
    setOtpCode("");
    setError("");
  }

  function switchOwnerMethod(next: "otp" | "password") {
    setOwnerMethod(next);
    setOtpStep(false);
    setOtpCode("");
    setError("");
  }

  const showOtpBack =
    mode === "owner" && ownerMethod === "otp" && otpStep;

  const primaryLabel =
    mode === "owner" && ownerMethod === "otp" && !otpStep
      ? "ส่งรหัส OTP"
      : "เข้าสู่ระบบ";

  const phoneReady = phone.length >= 9;
  const passwordReady = password.trim().length > 0;
  const usernameReady = username.trim().length > 0;
  const otpReady = otpCode.replace(/\D/g, "").length >= OTP_DIGIT_LENGTH;

  const primaryDisabled =
    loading ||
    (mode === "platform"
      ? !usernameReady || !passwordReady
      : ownerMethod === "password"
        ? !phoneReady || !passwordReady
        : otpStep
          ? otpSecondsLeft <= 0 || !otpReady
          : !phoneReady);

  return (
    <MerchantAuthShell
      title={copy.title}
      subtitle={copy.description}
      onBack={showOtpBack ? handleHeaderBack : undefined}
      backHref="/"
    >
      {mode === "owner" ? (
        <LoginMethodSelector method={ownerMethod} onChange={switchOwnerMethod} />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className={mode === "owner" ? "mt-6 space-y-6" : "space-y-6"}
      >
        {mode === "platform" ? (
          <AuthTextField
            id="admin-username"
            label={copy.usernameLabel}
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />
        ) : ownerMethod === "password" || !otpStep ? (
          <RegisterPhoneField
            id="owner-phone"
            label="เบอร์โทร"
            hint={
              ownerMethod === "otp"
                ? "ใช้เบอร์นี้รับรหัส OTP เพื่อเข้าสู่ระบบ"
                : "ใช้เบอร์ที่ลงทะเบียนตอนเปิดร้าน"
            }
            value={phone}
            onChange={setPhone}
            disabled={otpStep && ownerMethod === "otp"}
            className={mode === "owner" ? "mt-0" : "mt-8"}
          />
        ) : null}

        {mode === "platform" || ownerMethod === "password" ? (
          <AuthPasswordField
            id="admin-password"
            label="รหัสผ่าน"
            value={password}
            onChange={setPassword}
          />
        ) : null}

        {mode === "owner" && ownerMethod === "otp" && otpStep ? (
          <div>
            <p className="text-[15px] text-slate-600">
              ส่งรหัสไปที่ {phone}
              {otpRefNo ? ` (Ref: ${otpRefNo})` : ""}
            </p>
            <label
              id="owner-otp-label"
              htmlFor="owner-otp"
              className={`${authLabelClass} mt-4`}
            >
              รหัส OTP
            </label>
            <OtpDigitInput
              id="owner-otp"
              value={otpCode}
              onChange={setOtpCode}
              autoFocus
              className="mt-2"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p
                className={`text-sm ${
                  otpSecondsLeft <= 0 ? "text-red-600" : "text-slate-500"
                }`}
              >
                {otpSecondsLeft > 0
                  ? `หมดอายุใน ${formatOtpCountdown(otpSecondsLeft)}`
                  : "รหัสหมดอายุแล้ว"}
              </p>
              <button
                type="button"
                disabled={loading || otpSecondsLeft > 0}
                onClick={() => void sendOwnerOtp()}
                className="shrink-0 text-sm font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
              >
                ขอรหัสใหม่
              </button>
            </div>
          </div>
        ) : null}

        {mode === "owner" ? (
          <AuthOwnerLoginHint />
        ) : (
          <AuthHintBanner>
            <p>{copy.hint}</p>
          </AuthHintBanner>
        )}

        {error ? (
          <p className={authErrorClass} role="alert">
            {error}
          </p>
        ) : null}

        <RegisterPrimaryButton
          type="submit"
          disabled={primaryDisabled}
          loading={loading}
        >
          {primaryLabel}
        </RegisterPrimaryButton>
      </form>

      {mode === "owner" ? (
        <AuthFooterLink
          prompt="ยังไม่มีบัญชี?"
          href="/owner/register"
          linkLabel="สมัครเป็นร้านค้า"
        />
      ) : null}
    </MerchantAuthShell>
  );
}

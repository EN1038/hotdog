"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlatformMark } from "@/components/PlatformMark";
import { PhoneInput } from "@/components/PhoneInput";
import {
  merchantButtonClass,
  merchantInputClass,
  merchantLabelClass,
} from "@/components/merchant-login-ui";
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
    title: "เข้าใช้งาน SkillSale",
    description: "ใช้เบอร์โทรที่ลงทะเบียนตอนเปิดร้าน",
    usernameLabel: "เบอร์โทร",
    hint: "รับ OTP หรือใส่รหัสผ่านก็ได้ — รหัสเริ่มต้นมักเป็นเบอร์โทร",
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

  return (
    <main className="flex min-h-dvh flex-col bg-[#f4f5f7]">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="flex h-12 w-12 items-center justify-center rounded-xl text-gray-700"
          aria-label="กลับ"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="flex-1 pr-12 text-center text-base font-bold text-gray-900">
          {copy.title}
        </h1>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        <PlatformMark placement="login" height={36} priority />
        <p className="mt-3 text-sm text-gray-600">{copy.description}</p>

        {mode === "owner" ? (
          <div
            role="tablist"
            aria-label="วิธีเข้าสู่ระบบ"
            className="relative z-20 mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200"
          >
            {(
              [
                { id: "otp", label: "รับ OTP" },
                { id: "password", label: "รหัสผ่าน" },
              ] as const
            ).map((opt) => {
              const active = ownerMethod === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOwnerMethod(opt.id);
                    setOtpStep(false);
                    setOtpCode("");
                    setError("");
                  }}
                  className={`relative z-10 min-h-11 touch-manipulation rounded-xl py-2.5 text-sm font-bold transition-colors ${
                    active
                      ? "bg-site-primary text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-slate-50 active:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {mode === "platform" ? (
            <div>
              <label htmlFor="admin-username" className={merchantLabelClass}>
                {copy.usernameLabel}
              </label>
              <input
                id="admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={merchantInputClass}
                autoComplete="username"
                required
              />
            </div>
          ) : (
            <div>
              <label htmlFor="owner-phone" className={merchantLabelClass}>
                เบอร์โทร
              </label>
              <PhoneInput
                id="owner-phone"
                value={phone}
                onChange={setPhone}
                className={merchantInputClass}
                required
                disabled={otpStep && ownerMethod === "otp"}
              />
            </div>
          )}

          {mode === "platform" || ownerMethod === "password" ? (
            <div>
              <label htmlFor="admin-password" className={merchantLabelClass}>
                รหัสผ่าน
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={merchantInputClass}
                autoComplete="current-password"
                required
              />
            </div>
          ) : null}

          {mode === "owner" && ownerMethod === "otp" && otpStep ? (
            <div>
              <label htmlFor="owner-otp" className={merchantLabelClass}>
                รหัส OTP
              </label>
              <input
                id="owner-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                className={`${merchantInputClass} text-center tracking-[0.35em]`}
                value={otpCode}
                onChange={(e) =>
                  setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="••••••"
                required
                autoFocus
              />
              <p className="mt-2 text-sm text-gray-600">
                {otpRefNo ? `เลขอ้างอิง ${otpRefNo} · ` : ""}
                {otpSecondsLeft > 0
                  ? `หมดอายุใน ${formatOtpCountdown(otpSecondsLeft)}`
                  : "รหัสหมดอายุแล้ว"}
              </p>
              <button
                type="button"
                disabled={loading || otpSecondsLeft > 0}
                onClick={() => void sendOwnerOtp()}
                className="mt-2 text-sm font-semibold text-site-primary disabled:opacity-40"
              >
                ขอรหัสใหม่
              </button>
            </div>
          ) : null}

          <div className="flex gap-2 rounded-2xl bg-sky-50 px-4 py-4 text-sm leading-relaxed text-sky-950">
            <span className="mt-0.5 text-lg" aria-hidden>
              💡
            </span>
            <p>{copy.hint}</p>
          </div>

          {error ? (
            <p className="text-base text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={
              loading ||
              (mode === "owner" &&
                ownerMethod === "otp" &&
                otpStep &&
                otpSecondsLeft <= 0)
            }
            className={merchantButtonClass}
          >
            {loading
              ? "กำลังเข้าสู่ระบบ..."
              : mode === "owner" && ownerMethod === "otp" && !otpStep
                ? "รับรหัส OTP"
                : "เข้าสู่ระบบ"}
          </button>

          {mode === "owner" && ownerMethod === "otp" && otpStep ? (
            <button
              type="button"
              className="w-full text-sm font-medium text-gray-600"
              onClick={() => {
                setOtpStep(false);
                setOtpCode("");
                setError("");
              }}
            >
              เปลี่ยนเบอร์
            </button>
          ) : null}
        </form>

        {mode === "owner" ? (
          <p className="mt-6 text-center text-sm text-gray-500">
            ยังไม่มีบัญชี?{" "}
            <Link href="/owner/register" className="font-semibold text-site-primary">
              สมัครเป็นร้านค้า
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCustomer } from "./CustomerProvider";
import { SiteLogo } from "./SiteLogo";
import { useSiteBranding } from "./SiteBrandingProvider";
import { PhoneInput } from "@/components/PhoneInput";
import { IconPhone } from "@/components/icons";
import { getRememberedCustomerPhone } from "@/lib/customer-remember";
import { formatThaiPhone } from "@/lib/constants";
import { resolvePlatformMarkForPlacement } from "@/lib/platform-branding";

type CustomerLoginScreenProps = {
  onSuccess?: () => void;
  onBrowseShop?: () => void;
  onBack?: () => void;
  backHref?: string;
  showBrowseOption?: boolean;
  showBackButton?: boolean;
  brandName?: string | null;
  brandLogoUrl?: string | null;
  browseLabel?: string;
  browseHint?: string;
  /**
   * รูปหัวแบบปกเต็ม (object-cover):
   * - ลิงก์สาขา → รูปสาขา
   * - ลิงก์แบรนด์ → รูปปกแบรนด์
   * ถ้ายังไม่มีรูป จะโชว์โลโก้ตรงกลางหัวภาพแทน
   */
  heroImageUrl?: string | null;
};

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10h16l-1.2 9H5.2L4 10z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 10V7a4 4 0 018 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="#9ca3af"
        strokeWidth="1.8"
      />
      <path
        d="M8 11V8a4 4 0 118 0v3"
        stroke="#9ca3af"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BrandLogo({
  brandLogoUrl,
}: {
  brandLogoUrl?: string | null;
}) {
  return (
    <SiteLogo
      logoUrl={brandLogoUrl}
      size={88}
      platformPlacement="login"
    />
  );
}

export function CustomerLoginScreen({
  onSuccess,
  onBrowseShop,
  onBack,
  backHref = "/",
  showBrowseOption = true,
  showBackButton = true,
  brandLogoUrl,
  browseLabel = "เข้าชมร้าน",
  browseHint = "เลือกดูเมนูและร้านค้าได้ก่อน โดยไม่ต้องเข้าสู่ระบบ",
  heroImageUrl,
}: CustomerLoginScreenProps) {
  const pathname = usePathname();
  const { login, sendOtp, verifyOtp } = useCustomer();
  const branding = useSiteBranding();
  const platformLogin = resolvePlatformMarkForPlacement(branding, "login");
  const resolvedLogo = brandLogoUrl?.trim() || platformLogin.src;
  const resolvedHero = heroImageUrl?.trim() || null;
  const privacyHref = `/privacy?returnTo=${encodeURIComponent(pathname || "/")}`;

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [showName, setShowName] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpRefNo, setOtpRefNo] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberedPhone, setRememberedPhone] = useState("");

  useEffect(() => {
    const saved = getRememberedCustomerPhone();
    if (saved) {
      setPhone(saved);
      setRememberedPhone(saved);
    }
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function requestOtp(nextName?: string) {
    setError("");
    setLoading(true);
    const result = await sendOtp(phone, nextName ?? (showName ? name : undefined));
    setLoading(false);

    if (!result.ok) {
      if (result.needsName || result.error === "NEEDS_NAME") {
        setShowName(true);
        setOtpStep(false);
        return;
      }
      // Taximail not configured → fall back to passwordless login (local/dev)
      if (result.error.includes("ยังไม่ได้ตั้งค่า")) {
        const err = await login(phone, showName ? name : nextName);
        if (err === "NEEDS_NAME") {
          setShowName(true);
          return;
        }
        if (err) {
          setError(err);
          return;
        }
        onSuccess?.();
        return;
      }
      setError(result.error);
      return;
    }

    setChallengeId(result.challengeId);
    setOtpRefNo(result.otpRefNo);
    setOtpStep(true);
    setOtpCode("");
    setResendIn(result.resendIn);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!otpStep) {
      if (showName && !name.trim()) {
        setError("กรุณากรอกชื่อ");
        return;
      }
      await requestOtp(showName ? name : undefined);
      return;
    }

    if (!challengeId) {
      setError("กรุณาขอรหัส OTP ใหม่");
      return;
    }
    if (!otpCode.trim()) {
      setError("กรุณากรอกรหัส OTP");
      return;
    }

    setLoading(true);
    const err = await verifyOtp(
      phone,
      otpCode.trim(),
      challengeId,
      showName ? name : undefined,
    );
    setLoading(false);

    if (err === "NEEDS_NAME") {
      setShowName(true);
      setOtpStep(false);
      return;
    }
    if (err) {
      setError(err);
      return;
    }
    onSuccess?.();
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f5f5f6]">
      {/* หัวภาพเต็มขอบบน-ซ้าย-ขวา ไม่มนมุม */}
      <header className="relative shrink-0 overflow-hidden rounded-none">
        <div className="relative h-[34vh] min-h-[180px] max-h-[280px] w-full overflow-hidden rounded-none bg-stone-200">
          {resolvedHero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedHero}
              alt=""
              className="absolute inset-0 h-full w-full scale-[1.06] object-cover object-center"
            />
          ) : resolvedLogo ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-300 via-stone-100 to-orange-50 p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedLogo}
                alt=""
                className="max-h-[55%] max-w-[70%] object-contain drop-shadow-sm"
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-300 via-stone-100 to-orange-50 px-6 text-center">
              <p className="text-sm text-stone-500">ยังไม่มีรูปหัวภาพ</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
        </div>

        {showBackButton &&
          (onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-sm backdrop-blur hover:bg-white"
              aria-label="กลับ"
            >
              <BackIcon />
            </button>
          ) : (
            <Link
              href={backHref}
              className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-sm backdrop-blur hover:bg-white"
              aria-label="กลับ"
            >
              <BackIcon />
            </Link>
          ))}
      </header>

      <div className="relative z-10 -mt-5 flex flex-1 flex-col rounded-t-[20px] bg-white px-6 pb-10 pt-7 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col items-center">
          <BrandLogo brandLogoUrl={resolvedLogo} />
        </div>

        <div className="mt-6 text-center">
          <h2 className="text-base font-bold text-gray-900">
            {otpStep
              ? `ส่งรหัสไปที่ ${formatThaiPhone(phone)}`
              : "ใส่เบอร์โทรเพื่อเข้าใช้งาน"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {otpStep
              ? otpRefNo
                ? `เลขอ้างอิง ${otpRefNo} — เทียบกับข้อความ SMS`
                : "กรอกรหัส 4–6 หลักจากข้อความ SMS"
              : rememberedPhone
                ? `จำเบอร์ ${formatThaiPhone(rememberedPhone)} จากครั้งก่อนไว้แล้ว — กดขอรหัส OTP หรือแก้เป็นเบอร์อื่น`
                : "ระบบจะส่งรหัส OTP ไปยืนยันเบอร์ก่อนเข้าใช้งาน"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!otpStep && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                เบอร์โทรศัพท์
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-site-primary">
                  <IconPhone size={18} />
                </span>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  className="w-full rounded-xl border border-site-primary/30 bg-white py-3 pr-4 pl-11 text-sm leading-normal text-gray-900 placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
                  placeholder="เช่น 081-234-5678"
                  required
                  autoFocus={!rememberedPhone}
                />
              </div>
            </div>
          )}

          {!otpStep && showName && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                ชื่อ <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่อสำหรับติดต่อ"
                required
                autoFocus
              />
            </div>
          )}

          {otpStep && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                รหัส OTP
              </label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-center text-lg font-semibold tracking-[0.35em] text-gray-900 placeholder:text-gray-400 placeholder:tracking-normal focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
                value={otpCode}
                onChange={(e) =>
                  setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="••••••"
                required
                autoFocus
              />
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  className="font-medium text-gray-500 hover:text-gray-800"
                  onClick={() => {
                    setOtpStep(false);
                    setOtpCode("");
                    setChallengeId(null);
                    setError("");
                  }}
                >
                  เปลี่ยนเบอร์
                </button>
                <button
                  type="button"
                  disabled={loading || resendIn > 0}
                  className="font-medium text-site-primary hover:opacity-80 disabled:opacity-40"
                  onClick={() => void requestOtp(showName ? name : undefined)}
                >
                  {resendIn > 0 ? `ขอรหัสใหม่ใน ${resendIn}s` : "ขอรหัสใหม่"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-center text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-site-primary py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? otpStep
                ? "กำลังยืนยัน..."
                : "กำลังส่งรหัส..."
              : otpStep
                ? "ยืนยัน OTP"
                : showName
                  ? "ส่งรหัส OTP"
                  : "ขอรหัส OTP"}
          </button>
        </form>

        {showBrowseOption && onBrowseShop && !otpStep && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-sm text-gray-400">หรือ</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={onBrowseShop}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-site-primary bg-white py-3.5 text-sm font-semibold text-site-primary transition-colors hover:bg-site-primary-soft"
            >
              <ShopIcon />
              {browseLabel}
            </button>
            <p className="mt-2 text-center text-xs text-gray-400">
              {browseHint}
            </p>
          </>
        )}

        <div className="mt-auto pt-10 text-center">
          <div className="flex items-start justify-center gap-1.5 text-xs leading-relaxed text-gray-400">
            <LockIcon />
            <p>
              เบอร์โทรใช้เป็นรหัสลูกค้าเพื่อติดตามออเดอร์และประวัติการสั่ง
              <br />
              เรายืนยันด้วย OTP และไม่เผยแพร่ข้อมูลให้บุคคลที่สาม
            </p>
          </div>
          <Link
            href={privacyHref}
            className="mt-3 inline-block text-sm font-medium text-site-primary hover:opacity-80"
          >
            นโยบายความเป็นส่วนตัว
          </Link>
        </div>
      </div>
    </main>
  );
}

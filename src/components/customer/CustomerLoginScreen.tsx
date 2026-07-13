"use client";

import Link from "next/link";
import { useState } from "react";
import { useCustomer } from "./CustomerProvider";
import { SiteLogo } from "./SiteLogo";
import { useSiteBranding } from "./SiteBrandingProvider";

type CustomerLoginScreenProps = {
  onSuccess?: () => void;
  onBrowseShop?: () => void;
  onBack?: () => void;
  backHref?: string;
  showBrowseOption?: boolean;
  showBackButton?: boolean;
  brandName?: string | null;
  brandLogoUrl?: string | null;
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

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.6 3.4A2 2 0 018.2 3h2.2c.7 0 1.3.4 1.6 1l1.2 2.4a2 2 0 01-.5 2.2l-1 1a16 16 0 006.9 6.9l1-1a2 2 0 012.2-.5l2.4 1.2a2 2 0 011 1.6v2.2a2 2 0 01-2 2C10.3 21.5 2.5 13.7 2.5 4.2a2 2 0 012.1-1.8z"
        stroke="#ef4444"
        strokeWidth="1.8"
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
  return <SiteLogo logoUrl={brandLogoUrl} size={72} />;
}

function SkewersIllustration() {
  return (
    <svg
      width="110"
      height="90"
      viewBox="0 0 110 90"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <ellipse cx="55" cy="82" rx="38" ry="6" fill="#000" opacity="0.06" />
      <line
        x1="22"
        y1="78"
        x2="28"
        y2="18"
        stroke="#a16207"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="26" cy="14" r="7" fill="#ef4444" />
      <circle cx="26" cy="14" r="4.5" fill="#fca5a5" opacity="0.6" />
      <line
        x1="40"
        y1="80"
        x2="44"
        y2="14"
        stroke="#a16207"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="44" cy="10" r="7.5" fill="#f97316" />
      <circle cx="44" cy="10" r="4" fill="#fdba74" opacity="0.5" />
      <line
        x1="58"
        y1="78"
        x2="62"
        y2="16"
        stroke="#a16207"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="62" cy="12" r="7" fill="#dc2626" />
      <line
        x1="76"
        y1="80"
        x2="80"
        y2="12"
        stroke="#a16207"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="80" cy="8" r="7.5" fill="#ea580c" />
      <circle cx="80" cy="8" r="4" fill="#fed7aa" opacity="0.5" />
      <line
        x1="92"
        y1="78"
        x2="96"
        y2="20"
        stroke="#a16207"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="96" cy="16" r="6.5" fill="#b91c1c" />
      <path
        d="M18 30c6-4 14-6 22-4M30 42c8-2 16 0 24 4"
        stroke="#fbbf24"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function CustomerLoginScreen({
  onSuccess,
  onBrowseShop,
  onBack,
  backHref = "/",
  showBrowseOption = true,
  showBackButton = true,
  brandName,
  brandLogoUrl,
}: CustomerLoginScreenProps) {
  const { login } = useCustomer();
  const { siteName } = useSiteBranding();
  const displayName = brandName ?? siteName;
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [showName, setShowName] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const err = await login(phone, showName ? name : undefined);
    setLoading(false);

    if (err === "NEEDS_NAME") {
      setShowName(true);
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
      <header className="relative shrink-0 px-4 pb-2 pt-4">
        <div className="flex items-start gap-1">
          {showBackButton &&
            (onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-white/60"
                aria-label="กลับ"
              >
                <BackIcon />
              </button>
            ) : (
              <Link
                href={backHref}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-white/60"
                aria-label="กลับ"
              >
                <BackIcon />
              </Link>
            ))}

          <div
            className={`min-w-0 flex-1 pr-24 pt-0.5 ${showBackButton ? "" : "pl-1"}`}
          >
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-gray-900">
              เข้าสู่ระบบ
            </h1>
            <p className="mt-1 text-sm leading-snug text-gray-500">
              เข้าสู่ระบบเพื่อสั่งอาหารจากร้านที่คุณชอบ
            </p>
          </div>

          <div className="pointer-events-none absolute -right-2 top-1">
            <SkewersIllustration />
          </div>
        </div>
      </header>

      <div className="mt-3 flex flex-1 flex-col rounded-t-[28px] bg-white px-6 pb-10 pt-8 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col items-center">
          <BrandLogo brandLogoUrl={brandLogoUrl} />
          <p className="mt-3 text-lg font-bold text-site-primary">{displayName}</p>
        </div>

        <div className="mt-8 text-center">
          <h2 className="text-base font-bold text-gray-900">
            เข้าสู่ระบบด้วยเบอร์โทรศัพท์
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            กรุณาใส่เบอร์โทรศัพท์ของคุณเพื่อเข้าสู่ระบบ
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              เบอร์โทรศัพท์
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                <PhoneIcon />
              </span>
              <input
                type="tel"
                className="w-full rounded-xl border border-red-200 bg-white py-3 pr-4 pl-11 text-sm text-gray-900 placeholder:text-gray-400 focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="เช่น 081 234 5678"
                required
              />
            </div>
          </div>

          {showName && (
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
              />
            </div>
          )}

          {error && <p className="text-center text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-site-primary py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        {showBrowseOption && onBrowseShop && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-sm text-gray-400">หรือ</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={onBrowseShop}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-site-primary bg-white py-3.5 text-sm font-semibold text-site-primary transition-colors hover:bg-red-50"
            >
              <ShopIcon />
              เข้าชมร้าน
            </button>
            <p className="mt-2 text-center text-xs text-gray-400">
              เลือกดูเมนูและร้านค้าได้ก่อน โดยไม่ต้องเข้าสู่ระบบ
            </p>
          </>
        )}

        <div className="mt-auto pt-10 text-center">
          <div className="flex items-start justify-center gap-1.5 text-xs leading-relaxed text-gray-400">
            <LockIcon />
            <p>
              เราจะเก็บข้อมูลของคุณเป็นความลับ
              <br />
              และจะไม่เผยแพร่ให้บุคคลที่สามทราบ
            </p>
          </div>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-site-primary hover:opacity-80"
          >
            นโยบายความเป็นส่วนตัว
          </button>
        </div>
      </div>
    </main>
  );
}

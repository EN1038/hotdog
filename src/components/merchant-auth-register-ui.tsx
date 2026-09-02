"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  IconLine,
  OWNER_REGISTER_MODE_SELF_ICON,
  registerErrorClass,
  registerInputClass,
  registerLabelClass,
  registerOptionCardClass,
} from "@/components/owner/owner-register-ui";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

export {
  registerErrorClass as authErrorClass,
  registerInputClass as authInputClass,
  registerLabelClass as authLabelClass,
};

function IconShield({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
        selected ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600"
      }`}
      aria-hidden
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3 4 7v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 12 11 13.5 14.5 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function IconLock({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
        selected ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600"
      }`}
      aria-hidden
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect
          x="5"
          y="11"
          width="14"
          height="10"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M8 11V8a4 4 0 118 0v3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function MethodSegment({
  selected,
  onClick,
  title,
  subtitle,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`relative z-10 flex items-center gap-1.5 rounded-xl px-2 py-3 text-left transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        selected
          ? "text-white"
          : "text-slate-700 hover:bg-slate-50 active:bg-slate-100/80"
      }`}
    >
      {icon}
      <span className="min-w-0">
        <span className="block text-[15px] font-bold leading-tight">{title}</span>
        <span
          className={`mt-0.5 block text-[12px] leading-snug transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            selected ? "text-white/85" : "text-slate-500"
          }`}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}

export function LoginMethodSelector({
  method,
  onChange,
}: {
  method: "otp" | "password";
  onChange: (method: "otp" | "password") => void;
}) {
  return (
    <div className="rounded-[1.25rem] bg-white p-1.5 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)]">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-[calc(50%-0.1875rem)] rounded-xl bg-gradient-to-br from-[#0d9668] to-[#10b981] shadow-[0_4px_16px_-4px_rgba(16,185,129,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            transform:
              method === "password"
                ? "translateX(calc(100% + 0.375rem))"
                : "translateX(0)",
          }}
        />
        <div
          role="tablist"
          aria-label="วิธีเข้าสู่ระบบ"
          className="relative grid grid-cols-2 gap-1.5"
        >
          <MethodSegment
            selected={method === "otp"}
            onClick={() => onChange("otp")}
            title="รับ OTP"
            subtitle="ยืนยันด้วย SMS"
            icon={<IconShield selected={method === "otp"} />}
          />
          <MethodSegment
            selected={method === "password"}
            onClick={() => onChange("password")}
            title="รหัสผ่าน"
            subtitle="ใส่รหัสที่ตั้งไว้"
            icon={<IconLock selected={method === "password"} />}
          />
        </div>
      </div>
    </div>
  );
}

export function AuthLineContactLink({
  children = "ติดต่อแอดมิน",
}: {
  children?: ReactNode;
}) {
  return (
    <a
      href={PLATFORM_LINE_ADD_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-bold text-[#06C755] underline decoration-[#06C755]/40 underline-offset-2 transition-opacity hover:opacity-80"
    >
      <IconLine className="h-4 w-4 shrink-0" />
      {children}
    </a>
  );
}

export function AuthOwnerLoginHint() {
  return (
    <AuthHintBanner>
      <p>
        แนะนำเข้าด้วย OTP ถ้าต้องการเข้าด้วยรหัสผ่านให้{" "}
        <AuthLineContactLink />
      </p>
    </AuthHintBanner>
  );
}

export function AuthHintBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50/80 px-4 py-4 ring-1 ring-emerald-100/80">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.74V17a1 1 0 001 1h6a1 1 0 001-1v-2.26A7 7 0 0012 2z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="min-w-0 space-y-1 text-[14px] leading-relaxed text-emerald-800/90">
        {children}
      </div>
    </div>
  );
}

function IconLockCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 11V8a4 4 0 118 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconEye({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.58 10.58A2 2 0 0012 14a2 2 0 002.42-2.42M9.88 5.09A10.94 10.94 0 0112 5c6.5 0 10 7 10 7a18.45 18.45 0 01-4.11 5.17M6.12 6.12A18.45 18.45 0 002 12s3.5 7 10 7a10.94 10.94 0 005.91-1.72"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthPasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const filled = value.trim().length > 0;

  return (
    <div>
      <label htmlFor={id} className={registerLabelClass}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <IconLockCircle />
          </span>
        </span>
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full min-h-[4rem] rounded-2xl border bg-white py-3 pl-[3.75rem] pr-[3.75rem] text-[18px] font-semibold tracking-wide text-slate-900 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)] placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
            filled
              ? "border-emerald-300 ring-emerald-100/80"
              : "border-slate-100 focus:border-emerald-300 focus:ring-emerald-100/80"
          }`}
          autoComplete={autoComplete}
          required
        />
        <span className="absolute inset-y-0 right-3 flex items-center">
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
              visible
                ? "bg-emerald-500 text-white shadow-sm"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            }`}
            aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            aria-pressed={visible}
          >
            <IconEye open={visible} />
          </button>
        </span>
      </div>
    </div>
  );
}

export function AuthTextField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={registerLabelClass}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={registerInputClass}
        autoComplete={autoComplete}
        required
      />
    </div>
  );
}

export function AuthSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="text-[17px] font-bold leading-snug text-slate-900">{title}</h2>
      {description ? (
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function AuthBranchOption({
  branchName,
  brandName,
  branchKind,
  disabled,
  onClick,
}: {
  branchName: string;
  brandName?: string | null;
  branchKind?: "STORE" | "WAREHOUSE";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${registerOptionCardClass(false)} flex w-full flex-col disabled:opacity-50`}
    >
      <span className="text-[16px] font-bold text-slate-900">
        {branchName.replace(/^สาขา\s*/, "")}
      </span>
      {branchKind === "WAREHOUSE" ? (
        <span className="mt-0.5 text-[13px] font-semibold text-teal-700">สต๊อกกลาง</span>
      ) : null}
      {brandName ? (
        <span className="mt-0.5 text-[13px] text-slate-500">{brandName}</span>
      ) : null}
    </button>
  );
}

export function AuthSecondaryButton({
  children,
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[3rem] w-full items-center justify-center rounded-2xl text-[16px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 active:bg-slate-100 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function AuthFooterLink({
  prompt,
  href,
  linkLabel,
}: {
  prompt: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <p className="mt-8 text-center text-[15px] text-slate-500">
      {prompt}{" "}
      <Link
        href={href}
        className="font-bold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline"
      >
        {linkLabel}
      </Link>
    </p>
  );
}

export function AuthOtpMetaRow({
  left,
  right,
  onLeftClick,
  onRightClick,
  rightDisabled,
}: {
  left: ReactNode;
  right: ReactNode;
  onLeftClick?: () => void;
  onRightClick?: () => void;
  rightDisabled?: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-[14px]">
      {onLeftClick ? (
        <button
          type="button"
          className="font-medium text-slate-500 transition-colors hover:text-slate-800"
          onClick={onLeftClick}
        >
          {left}
        </button>
      ) : (
        <span className="text-slate-500">{left}</span>
      )}
      {onRightClick ? (
        <button
          type="button"
          disabled={rightDisabled}
          className="font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
          onClick={onRightClick}
        >
          {right}
        </button>
      ) : (
        <span className="font-semibold text-emerald-600">{right}</span>
      )}
    </div>
  );
}

export const AUTH_STAFF_ICON = OWNER_REGISTER_MODE_SELF_ICON;

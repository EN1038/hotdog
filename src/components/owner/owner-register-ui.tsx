"use client";

import Link from "next/link";
import { useEffect, type ReactNode, type SVGProps } from "react";
import { PhoneInput } from "@/components/PhoneInput";
import { IconPhone } from "@/components/icons";
import {
  MerchantRegisterStyleShell,
  MERCHANT_REGISTER_HEADER_BG,
} from "@/components/MerchantRegisterStyleShell";
import { OWNER_REGISTER_TRIAL_DAYS } from "@/lib/owner-register-shared";

export const OWNER_REGISTER_HEADER_BG = MERCHANT_REGISTER_HEADER_BG;
export const OWNER_REGISTER_TRIAL_ICON = "/icon_free.webp";
export const OWNER_REGISTER_MODE_SELF_ICON = "/icon_customer.webp";
export const OWNER_REGISTER_MODE_LINE_ICON = "/icon_contact.webp";
export const OWNER_REGISTER_SECURITY_ICON = "/icon_security.webp";

/** Label order matches registration flow (left → right). */
export const REGISTER_PROGRESS_LABELS = [
  "ยืนยันเบอร์",
  "ยืนยัน OTP",
  "ข้อมูลร้านค้า",
  "เสร็จสิ้น",
] as const;

type OwnerRegisterShellProps = {
  onBack?: () => void;
  backHref?: string;
  hideBack?: boolean;
  children: ReactNode;
};

export function OwnerRegisterShell({
  onBack,
  backHref = "/",
  hideBack = false,
  children,
}: OwnerRegisterShellProps) {
  return (
    <MerchantRegisterStyleShell
      title="สมัครเป็นร้านค้า"
      subtitle={
        <>
          เริ่มขายคอร์สออนไลน์ของคุณ
          <br />
          ง่าย ๆ กับ SkillSale
        </>
      }
      backHref={backHref}
      onBack={onBack}
      hideBack={hideBack}
    >
      {children}
    </MerchantRegisterStyleShell>
  );
}

type RegisterMode = "self" | "line";

export function RegisterModeSelector({
  mode,
  onChange,
}: {
  mode: RegisterMode;
  onChange: (mode: RegisterMode) => void;
}) {
  return (
    <div className="rounded-[1.25rem] bg-white p-1.5 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)]">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-[calc(50%-0.1875rem)] rounded-xl bg-gradient-to-br from-[#0d9668] to-[#10b981] shadow-[0_4px_16px_-4px_rgba(16,185,129,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            transform:
              mode === "line"
                ? "translateX(calc(100% + 0.375rem))"
                : "translateX(0)",
          }}
        />
        <div
          role="tablist"
          aria-label="วิธีสมัคร"
          className="relative grid grid-cols-2 gap-1.5"
        >
          <ModeSegment
            selected={mode === "self"}
            onClick={() => onChange("self")}
            title="สมัครเอง"
            subtitle="เปิดร้านด้วยตัวเอง"
            iconSrc={OWNER_REGISTER_MODE_SELF_ICON}
          />
          <ModeSegment
            selected={mode === "line"}
            onClick={() => onChange("line")}
            title="ติดต่อทีมงาน"
            subtitle="ให้เราช่วยแนะนำ"
            iconSrc={OWNER_REGISTER_MODE_LINE_ICON}
          />
        </div>
      </div>
    </div>
  );
}

function ModeSegment({
  selected,
  onClick,
  title,
  subtitle,
  iconSrc,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  iconSrc: string;
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt=""
        width={44}
        height={44}
        className={`h-11 w-11 shrink-0 object-contain transition-[filter] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          selected
            ? "brightness-0 invert drop-shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
            : "brightness-100 invert-0 drop-shadow-[0_3px_8px_rgba(15,23,42,0.1)]"
        }`}
        aria-hidden
      />
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

export function TrialBanner() {
  return (
    <div className="mt-5 flex gap-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50/80 px-4 py-4 ring-1 ring-emerald-100/80">
      <span className="relative flex h-19 w-20 shrink-0 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={OWNER_REGISTER_TRIAL_ICON}
          alt=""
          width={80}
          height={76}
          className="h-19 w-20 object-contain drop-shadow-[0_6px_14px_rgba(16,94,57,0.28)]"
          aria-hidden
        />
      </span>
      <div className="min-w-0 py-0.5">
        <p className="text-[16px] font-bold leading-snug text-emerald-800">
          ทดลองใช้ฟรี {OWNER_REGISTER_TRIAL_DAYS} วัน
        </p>
        <p className="mt-0.5 text-[14px] text-emerald-700/90">
          สร้างสาขาหลักให้อัตโนมัติ
        </p>
        <p className="mt-1 text-[12px] text-emerald-600/85">
          ไม่มีค่าใช้จ่าย • ยกเลิกได้ตลอดเวลา
        </p>
      </div>
    </div>
  );
}

export function RegisterProgressSteps({
  activeIndex,
  completedThrough = activeIndex - 1,
}: {
  activeIndex: number;
  completedThrough?: number;
}) {
  const fillPct =
    REGISTER_PROGRESS_LABELS.length <= 1
      ? 0
      : (Math.max(activeIndex, completedThrough) / (REGISTER_PROGRESS_LABELS.length - 1)) *
        75;

  return (
    <div className="mt-6 px-1" aria-label="ขั้นตอนการสมัคร">
      <div className="relative flex items-center justify-between">
        <div
          aria-hidden
          className="absolute left-[12.5%] right-[12.5%] top-[11px] h-[3px] rounded-full bg-slate-200"
        />
        <div
          aria-hidden
          className="absolute left-[12.5%] top-[11px] h-[3px] rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${fillPct}%` }}
        />
        {REGISTER_PROGRESS_LABELS.map((label, index) => {
          const done = index <= completedThrough && index !== activeIndex;
          const active = index === activeIndex;

          return (
            <div
              key={label}
              className="relative z-[1] flex w-[25%] flex-col items-center"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-[3px] transition ${
                  done || active
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-slate-200 bg-white"
                }`}
              >
                {(done || active) && (
                  <span className="h-2 w-2 rounded-full bg-white" />
                )}
              </span>
              <p
                className={`mt-2.5 max-w-[4.25rem] text-center text-[10px] font-semibold leading-tight sm:max-w-none sm:text-[11px] ${
                  active
                    ? "text-emerald-700"
                    : done
                      ? "text-emerald-600"
                      : "text-slate-400"
                }`}
              >
                {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type RegisterCreateStage = {
  id: string;
  label: string;
};

function RegisterStageCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l4 4L19 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={24}
        strokeDasharray={24}
        className="register-check-stroke"
      />
    </svg>
  );
}

function RegisterStageActiveSpinner() {
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
      <span
        className="absolute inset-0 rounded-full border-2 border-emerald-200"
        aria-hidden
      />
      <span
        className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-600 border-r-emerald-400/70"
        aria-hidden
      />
      <span className="relative h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
    </span>
  );
}

function RegisterCreateStageIndicator({
  status,
  stepNumber,
}: {
  status: "pending" | "active" | "done";
  stepNumber: number;
}) {
  if (status === "done") {
    return (
      <span className="register-stage-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <RegisterStageCheckIcon />
      </span>
    );
  }

  if (status === "active") {
    return <RegisterStageActiveSpinner />;
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-500">
      {stepNumber}
    </span>
  );
}

function RegisterCreatingDots() {
  return (
    <span className="ml-1 inline-flex items-end gap-0.5 pb-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-slate-700 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function RegisterCreateProgress({
  complete,
  stages,
  currentStageId,
  skipStageIds = [],
  footer,
}: {
  complete: boolean;
  stages: RegisterCreateStage[];
  currentStageId: string;
  skipStageIds?: string[];
  footer?: ReactNode;
}) {
  const currentIdx = stages.findIndex((s) => s.id === currentStageId);
  const allComplete = currentStageId === "complete" || complete;

  return (
    <div className="rounded-2xl bg-emerald-50/80 p-5 ring-1 ring-emerald-100">
      <p className="flex items-center justify-center text-lg font-bold text-slate-900">
        {allComplete ? (
          <>
            <span className="register-stage-pop mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
              <RegisterStageCheckIcon />
            </span>
            สมัครสำเร็จ!
          </>
        ) : (
          <>
            กำลังสร้างร้าน
            <RegisterCreatingDots />
          </>
        )}
      </p>
      <ul className="mt-5 space-y-3" aria-live="polite" aria-busy={!allComplete}>
        {stages.map((stage, stageIdx) => {
          const done = stageIdx < currentIdx || allComplete;
          const active = stage.id === currentStageId && !allComplete;
          const skip = skipStageIds.includes(stage.id);

          if (skip && !done) return null;

          let status: "pending" | "active" | "done";
          if (done) status = "done";
          else if (active) status = "active";
          else status = "pending";

          return (
            <li
              key={stage.id}
              className={`flex items-center gap-3 text-base transition-colors duration-300 ${
                status === "done"
                  ? "font-semibold text-emerald-700"
                  : status === "active"
                    ? "font-bold text-slate-900"
                    : "text-slate-400"
              }`}
            >
              <RegisterCreateStageIndicator
                status={status}
                stepNumber={stageIdx + 1}
              />
              {stage.label}
            </li>
          );
        })}
      </ul>
      {footer ? (
        <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>
      ) : null}
    </div>
  );
}

export function RegisterPhoneField({
  value,
  onChange,
  autoFocus,
  id = "owner-register-phone",
  label = "เบอร์โทรเจ้าของร้าน",
  hint = "ใช้เบอร์นี้เข้าระบบด้วย OTP ในครั้งถัดไป",
  disabled = false,
  className,
}: {
  value: string;
  onChange: (digits: string) => void;
  autoFocus?: boolean;
  id?: string;
  label?: string;
  hint?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const valid = value.length >= 9;

  return (
    <div className={className ?? "mt-8"}>
      <label htmlFor={id} className={registerLabelClass}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <IconPhone size={18} />
          </span>
        </span>
        <PhoneInput
          id={id}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
          disabled={disabled}
          className={`w-full min-h-[4rem] rounded-2xl border bg-white py-3 pl-[3.75rem] pr-[3.75rem] text-[18px] font-semibold tracking-wide text-slate-900 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)] placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 ${
            valid
              ? "border-emerald-300 ring-emerald-100/80"
              : "border-slate-100 focus:border-emerald-300 focus:ring-emerald-100/80"
          }`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
              valid
                ? "bg-emerald-500 text-white shadow-sm"
                : "bg-slate-100 text-slate-300"
            }`}
            aria-hidden
          >
            <IconCheck />
          </span>
        </span>
      </div>
      {hint ? (
        <p className="mt-2.5 text-[13px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function RegisterWizardBackButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[3rem] w-full items-center justify-center gap-1.5 rounded-2xl text-[16px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 active:bg-slate-100 disabled:opacity-40"
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
      ย้อนกลับ
    </button>
  );
}

export function RegisterPrimaryButton({
  children,
  disabled,
  loading,
  onClick,
  type = "button",
  showIcon = true,
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  showIcon?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className="grid min-h-[3.75rem] w-full grid-cols-[2.75rem_1fr_2.75rem] items-center rounded-2xl bg-gradient-to-r from-[#0d9668] via-[#10b981] to-[#14b8a6] px-2 text-[17px] font-bold text-white shadow-[0_10px_28px_-8px_rgba(16,185,129,0.55)] transition-all duration-200 enabled:hover:-translate-y-px enabled:hover:brightness-[1.03] enabled:hover:shadow-[0_14px_32px_-8px_rgba(16,185,129,0.62)] active:translate-y-0 active:scale-[0.99] disabled:opacity-50"
    >
      <span aria-hidden />
      <span className="col-start-2 flex items-center justify-center gap-2">
        {showIcon ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={OWNER_REGISTER_SECURITY_ICON}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 object-contain brightness-0 invert"
            aria-hidden
          />
        ) : null}
        <span className="truncate">
          {loading ? "กำลังดำเนินการ…" : children}
        </span>
      </span>
      <span className="col-start-3 flex justify-end pr-3">
        <IconChevronRight />
      </span>
    </button>
  );
}

export function RegisterLoginFooter() {
  return (
    <p className="mt-8 text-center text-[15px] text-slate-500">
      มีบัญชีแล้ว?{" "}
      <Link
        href="/owner/login"
        className="font-bold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline"
      >
        เข้าสู่ระบบ
      </Link>
    </p>
  );
}

export function RegisterOtpExpiredModal({
  open,
  onAcknowledge,
}: {
  open: boolean;
  onAcknowledge: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        onClick={onAcknowledge}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-otp-expired-title"
        className="relative w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80"
      >
        <div className="bg-gradient-to-br from-amber-50 via-white to-emerald-50/40 px-6 pb-2 pt-7 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-8 ring-amber-50">
            <IconOtpExpired />
          </span>
          <h2
            id="register-otp-expired-title"
            className="mt-5 text-[20px] font-bold tracking-tight text-slate-900"
          >
            รหัส OTP หมดอายุ
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
            รหัสยืนยันหมดเวลาแล้ว — กรุณากดส่งรหัส OTP ใหม่ที่หน้ากรอกเบอร์
            เพื่อดำเนินการสมัครต่อ
          </p>
        </div>
        <div className="px-6 pb-6 pt-4">
          <button
            type="button"
            onClick={onAcknowledge}
            className="min-h-[3.25rem] w-full rounded-2xl bg-gradient-to-r from-[#0d9668] via-[#10b981] to-[#14b8a6] text-[16px] font-bold text-white shadow-[0_10px_28px_-8px_rgba(16,185,129,0.55)] transition-all duration-200 hover:brightness-[1.03] active:scale-[0.99]"
          >
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}

export const registerLabelClass =
  "mb-2.5 block text-[14px] font-medium text-slate-500";

export const registerInputClass =
  "w-full min-h-[3.75rem] rounded-2xl border border-slate-100 bg-white px-4 text-[17px] font-semibold text-slate-900 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.1)] placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100/80";

export const registerOptionCardClass = (selected: boolean) =>
  `w-full rounded-2xl px-4 py-3.5 text-left transition-all duration-200 ${
    selected
      ? "bg-emerald-50 ring-2 ring-emerald-400/50"
      : "bg-[#f8faf9] ring-1 ring-slate-200/70 hover:bg-white hover:ring-emerald-200/80 active:scale-[0.99]"
  }`;

export const registerErrorClass =
  "mt-4 rounded-2xl bg-red-50 px-4 py-3 text-[15px] text-red-700 ring-1 ring-red-100";

function IconOtpExpired() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l4 4L19 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 text-white"
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconLine(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.270 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

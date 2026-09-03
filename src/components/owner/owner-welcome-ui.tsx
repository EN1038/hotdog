"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformMark } from "@/components/PlatformMark";
import { IconChevronRight } from "@/components/icons";
import {
  OWNER_REGISTER_HEADER_BG,
  OWNER_REGISTER_TRIAL_ICON,
  IconLine,
} from "@/components/owner/owner-register-ui";

export type OwnerWelcomeReadyItem = {
  id: string;
  label: ReactNode;
};

export type OwnerWelcomeStep = {
  n: number;
  title: string;
  hint: string;
  icon: "menu" | "store" | "staff";
};

type OwnerWelcomeContentProps = {
  brandName: string;
  readyItems: OwnerWelcomeReadyItem[];
  steps: readonly OwnerWelcomeStep[];
  trialDaysTotal: number;
  daysLeft: number | null;
  trialLabel: string | null;
  daysLeftText: string | null;
  trialProgress: number;
  lineUrl: string;
};

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function LucideIcon({
  className = "h-6 w-6 text-site-primary",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function StepIcon({ kind }: { kind: OwnerWelcomeStep["icon"] }) {
  if (kind === "menu") {
    return (
      <LucideIcon>
        <path d="M16 13h6" />
        <path d="m16.5 6.5-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l1.79-1.79" />
        <path d="M19 10v6" />
        <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />
      </LucideIcon>
    );
  }
  if (kind === "store") {
    return (
      <LucideIcon>
        <path d="M10 22v-8" />
        <path d="M2.336 8.89 10 14l11.715-7.029" />
        <path d="M22 14a2 2 0 0 1-.971 1.715l-10 6a2 2 0 0 1-2.138-.05l-6-4A2 2 0 0 1 2 16v-6a2 2 0 0 1 .971-1.715l10-6a2 2 0 0 1 2.138.05l6 4A2 2 0 0 1 22 8z" />
      </LucideIcon>
    );
  }
  return (
    <LucideIcon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </LucideIcon>
  );
}

function WelcomeReadyRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-site-primary-soft px-3.5 py-3 ring-1 ring-site-primary-soft">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-site-primary text-white shadow-sm"
        aria-hidden
      >
        <IconCheck />
      </span>
      <span className="text-[14px] font-semibold leading-snug text-slate-900">
        {children}
      </span>
    </li>
  );
}

function WelcomeNextStep({
  step,
}: {
  step: OwnerWelcomeStep;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <div className="relative w-full pb-3">
        <div className="mx-auto flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-2xl bg-site-primary-soft ring-1 ring-site-primary-soft">
          <StepIcon kind={step.icon} />
        </div>
        <span className="absolute bottom-0 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-site-primary text-[11px] font-bold text-white ring-2 ring-white">
          {step.n}
        </span>
      </div>
      <p className="text-[13px] font-bold leading-snug text-slate-900">
        {step.title}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{step.hint}</p>
    </div>
  );
}

function WelcomeNextStepConnector() {
  return (
    <div
      className="flex shrink-0 items-center self-start px-0.5 pt-[2.125rem]"
      aria-hidden
    >
      <IconChevronRight size={15} className="text-slate-300" />
    </div>
  );
}

function WelcomeNextStepsFlow({ steps }: { steps: readonly OwnerWelcomeStep[] }) {
  return (
    <div className="mt-5 flex items-start justify-between gap-0.5">
      {steps.flatMap((step, index) => {
        const nodes = [<WelcomeNextStep key={step.n} step={step} />];
        if (index < steps.length - 1) {
          nodes.push(
            <WelcomeNextStepConnector key={`${step.n}-connector`} />,
          );
        }
        return nodes;
      })}
    </div>
  );
}

function TrialProgressRing({
  daysLeft,
  fallbackDays,
  progress,
}: {
  daysLeft: number | null;
  fallbackDays: number;
  progress: number;
}) {
  const displayDays =
    daysLeft != null && daysLeft >= 0 ? daysLeft : fallbackDays;

  return (
    <div className="relative flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="var(--site-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(8, progress)} 100`}
        />
      </svg>
      <div className="text-center">
        <p className="text-[22px] font-black tabular-nums leading-none text-site-primary">
          {displayDays}
        </p>
        <p className="mt-0.5 text-[11px] font-bold text-site-primary/85">วัน</p>
      </div>
    </div>
  );
}

export function OwnerWelcomeLoading() {
  return (
    <main className="min-h-dvh bg-[#f4f8f6]">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="h-10 w-10 animate-pulse rounded-full bg-site-primary/20" />
        <p className="text-sm font-medium text-slate-500">กำลังเตรียมร้าน…</p>
      </div>
    </main>
  );
}

export function OwnerWelcomeContent({
  brandName,
  readyItems,
  steps,
  trialDaysTotal,
  daysLeft,
  trialLabel,
  daysLeftText,
  trialProgress,
  lineUrl,
}: OwnerWelcomeContentProps) {
  return (
    <main className="min-h-dvh bg-[#f4f8f6]">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex shrink-0 justify-center py-3">
          <PlatformMark placement="login" height={40} priority />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <section className="relative mt-2 overflow-hidden rounded-[1.75rem] shadow-[0_16px_48px_-16px_rgba(16,94,57,0.35)]">
            <div
              className="relative bg-cover bg-center bg-no-repeat px-5 pb-16 pt-8 text-center"
              style={{ backgroundImage: `url('${OWNER_REGISTER_HEADER_BG}')` }}
            >
              <div className="absolute inset-0 bg-site-primary/85" />
              <div className="relative">
                <p className="text-[13px] font-bold tracking-wide text-white/90">
                  เปิดร้านสำเร็จ
                </p>
                <h1 className="mt-1 text-[2rem] font-black leading-tight tracking-tight text-white">
                  ยินดีต้อนรับ!
                </h1>
                <p className="mt-3 text-[1.35rem] font-extrabold leading-snug text-white/90">
                  {brandName}
                </p>
                <p className="mt-2 text-[14px] font-medium leading-relaxed text-white/85">
                  พร้อมทดลองใช้ระบบขายและจัดการร้าน
                </p>
              </div>
            </div>

            <div className="relative z-10 -mt-10 px-4 pb-1">
              <div className="rounded-[1.35rem] bg-white p-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.18)] ring-1 ring-slate-100">
                <div className="flex items-center gap-3">
                  <TrialProgressRing
                    daysLeft={daysLeft}
                    fallbackDays={trialDaysTotal}
                    progress={trialProgress}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-extrabold text-slate-900">
                      ทดลองใช้ฟรี {trialDaysTotal} วัน
                    </p>
                    {trialLabel ? (
                      <p className="mt-0.5 text-[13px] font-semibold text-slate-600">
                        ถึง {trialLabel}
                        {daysLeftText ? ` · ${daysLeftText}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                      ลองครบทุกฟีเจอร์ รวมสต๊อก · ครัว · รายงาน
                    </p>
                  </div>
                  <span className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-[4.5rem]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={OWNER_REGISTER_TRIAL_ICON}
                      alt=""
                      width={72}
                      height={68}
                      className="h-full w-full object-contain object-right drop-shadow-[0_8px_16px_rgba(16,94,57,0.22)]"
                      aria-hidden
                    />
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-[1.35rem] bg-white p-4 shadow-[0_4px_24px_-10px_rgba(15,23,42,0.1)] ring-1 ring-slate-100">
            <p className="text-[16px] font-extrabold text-slate-900">
              สิ่งที่พร้อมแล้ว
            </p>
            <ul className="mt-3 space-y-2">
              {readyItems.map((item) => (
                <WelcomeReadyRow key={item.id}>{item.label}</WelcomeReadyRow>
              ))}
            </ul>
          </section>

          <section className="mt-4 rounded-[1.35rem] bg-white p-4 shadow-[0_4px_24px_-10px_rgba(15,23,42,0.1)] ring-1 ring-slate-100">
            <p className="text-[16px] font-extrabold text-slate-900">
              ขั้นตอนถัดไป
            </p>
            <p className="mt-0.5 text-[13px] font-medium text-slate-500">
              ทำ 3 อย่างนี้ก่อนเปิดขายจริง
            </p>

            <WelcomeNextStepsFlow steps={steps} />
          </section>

          <div className="mt-6 space-y-3 pb-2">
            <Link
              href="/owner"
              className="grid min-h-[3.75rem] w-full grid-cols-[1fr_auto] items-center rounded-[1.125rem] bg-site-primary px-5 text-[17px] font-bold text-white shadow-site-primary-button transition-all duration-200 hover:bg-site-primary-hover active:scale-[0.99] active:bg-site-primary-active"
            >
              <span className="text-center">เริ่มใช้งาน</span>
              <IconChevronRight className="mr-1" />
            </Link>

            <a
              href={lineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[3.25rem] w-full items-center justify-center gap-2.5 rounded-[1.125rem] border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100"
            >
              <IconLine className="text-[#06C755]" />
              ติดต่อทีมงาน
            </a>

            <p className="pt-2 text-center text-[15px] text-slate-500">
              มีบัญชีแล้ว?{" "}
              <Link
                href="/owner/login"
                className="font-bold text-site-primary transition-colors hover:text-site-primary-hover hover:underline"
              >
                เข้าสู่ระบบ
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

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

/** Welcome page palette — fixed greens, not site theme. */
const W = {
  deep: "#047857",
  mid: "#0d9668",
  bright: "#10b981",
  teal: "#14b8a6",
  lime: "#86efac",
  soft: "#ecfdf5",
  softRing: "#a7f3d0",
  ink: "#0f172a",
  muted: "#64748b",
  pageTop: "#ffffff",
  pageMid: "#f0fdf8",
  pageBottom: "#d1fae5",
} as const;

const PAGE_BG = `linear-gradient(180deg, ${W.pageTop} 0%, ${W.pageMid} 42%, ${W.pageBottom} 100%)`;

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

function StepGlyph({
  kind,
}: {
  kind: OwnerWelcomeStep["icon"];
}) {
  const common = {
    className: "h-6 w-6",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    stroke: W.mid,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (kind === "menu") {
    return (
      <svg {...common}>
        <path d="M16 13h6" />
        <path d="m16.5 6.5-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l1.79-1.79" />
        <path d="M19 10v6" />
        <circle cx="7.5" cy="7.5" r=".5" fill={W.mid} stroke="none" />
      </svg>
    );
  }
  if (kind === "store") {
    return (
      <svg {...common}>
        <path d="M10 22v-8" />
        <path d="M2.336 8.89 10 14l11.715-7.029" />
        <path d="M22 14a2 2 0 0 1-.971 1.715l-10 6a2 2 0 0 1-2.138-.05l-6-4A2 2 0 0 1 2 16v-6a2 2 0 0 1 .971-1.715l10-6a2 2 0 0 1 2.138.05l6 4A2 2 0 0 1 22 8z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function WelcomeReadyRow({ children }: { children: ReactNode }) {
  return (
    <li
      className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
      style={{
        backgroundColor: W.soft,
        boxShadow: `inset 0 0 0 1px ${W.softRing}`,
      }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
        style={{ backgroundColor: W.bright }}
        aria-hidden
      >
        <IconCheck />
      </span>
      <span
        className="text-[14px] font-semibold leading-snug"
        style={{ color: W.ink }}
      >
        {children}
      </span>
    </li>
  );
}

function WelcomeNextStep({ step }: { step: OwnerWelcomeStep }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <div className="relative w-full pb-3">
        <div
          className="mx-auto flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-2xl"
          style={{
            backgroundColor: W.soft,
            boxShadow: `inset 0 0 0 1px ${W.softRing}`,
          }}
        >
          <StepGlyph kind={step.icon} />
        </div>
        <span
          className="absolute bottom-0 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-white"
          style={{ backgroundColor: W.mid }}
        >
          {step.n}
        </span>
      </div>
      <p
        className="text-[13px] font-bold leading-snug"
        style={{ color: W.ink }}
      >
        {step.title}
      </p>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: W.muted }}>
        {step.hint}
      </p>
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
  // progress prop is "used days" %; ring should show remaining portion
  const remainingPct =
    daysLeft != null && daysLeft >= 0
      ? Math.max(8, Math.round((daysLeft / fallbackDays) * 100))
      : Math.max(8, 100 - progress);

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
          stroke={W.bright}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${remainingPct} 100`}
        />
      </svg>
      <div className="text-center">
        <p
          className="text-[22px] font-black tabular-nums leading-none"
          style={{ color: W.mid }}
        >
          {displayDays}
        </p>
        <p
          className="mt-0.5 text-[11px] font-bold"
          style={{ color: W.mid }}
        >
          วัน
        </p>
      </div>
    </div>
  );
}

function HeroWaveDecor() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <path
        d="M-20 140 Q80 60 180 110 T400 90"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.5"
      />
      <path
        d="M-10 170 Q100 90 200 140 T410 120"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1"
      />
      <circle cx="320" cy="48" r="36" fill="#ffffff" opacity="0.12" />
      <circle cx="360" cy="90" r="22" fill="#ffffff" opacity="0.1" />
    </svg>
  );
}

export function OwnerWelcomeLoading() {
  return (
    <main className="min-h-dvh" style={{ background: PAGE_BG }}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div
          className="h-10 w-10 animate-pulse rounded-full"
          style={{ backgroundColor: `${W.bright}33` }}
        />
        <p className="text-sm font-medium" style={{ color: W.muted }}>
          กำลังเตรียมร้าน…
        </p>
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
    <main className="min-h-dvh" style={{ background: PAGE_BG }}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex shrink-0 justify-center py-3">
          <PlatformMark placement="login" height={40} priority />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <section
            className="relative mt-2 overflow-hidden rounded-[1.75rem]"
            style={{
              boxShadow: "0 16px 48px -16px rgba(4,120,87,0.4)",
            }}
          >
            <div
              className="relative overflow-hidden bg-cover bg-center bg-no-repeat px-5 pb-16 pt-8 text-center"
              style={{ backgroundImage: `url('${OWNER_REGISTER_HEADER_BG}')` }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(160deg, ${W.deep}f2 0%, ${W.mid}e8 55%, ${W.teal}d9 100%)`,
                }}
              />
              <HeroWaveDecor />
              <div className="relative">
                <p className="text-[13px] font-bold tracking-wide text-white/90">
                  เปิดร้านสำเร็จ
                </p>
                <h1 className="mt-1 text-[2rem] font-black leading-tight tracking-tight text-white">
                  ยินดีต้อนรับ!
                </h1>
                <p
                  className="mt-3 text-[1.35rem] font-extrabold leading-snug"
                  style={{ color: W.lime }}
                >
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
                    <p
                      className="text-[15px] font-extrabold"
                      style={{ color: W.mid }}
                    >
                      ทดลองใช้ฟรี {trialDaysTotal} วัน
                    </p>
                    {trialLabel ? (
                      <p
                        className="mt-0.5 text-[13px] font-semibold"
                        style={{ color: W.muted }}
                      >
                        ถึง {trialLabel}
                        {daysLeftText ? ` · ${daysLeftText}` : ""}
                      </p>
                    ) : null}
                    <p
                      className="mt-1 text-[12px] leading-relaxed"
                      style={{ color: W.muted }}
                    >
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
                      className="h-full w-full object-contain object-right drop-shadow-[0_8px_16px_rgba(16,185,129,0.22)]"
                      aria-hidden
                    />
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="relative mt-4 overflow-hidden rounded-[1.35rem] bg-white p-4 shadow-[0_4px_24px_-10px_rgba(15,23,42,0.1)] ring-1 ring-slate-100">
            <p
              className="text-[16px] font-extrabold"
              style={{ color: W.ink }}
            >
              สิ่งที่พร้อมแล้ว
            </p>
            <ul className="relative z-[1] mt-3 space-y-2">
              {readyItems.map((item) => (
                <WelcomeReadyRow key={item.id}>{item.label}</WelcomeReadyRow>
              ))}
            </ul>
          </section>

          <section className="mt-4 rounded-[1.35rem] bg-white p-4 shadow-[0_4px_24px_-10px_rgba(15,23,42,0.1)] ring-1 ring-slate-100">
            <p
              className="text-[16px] font-extrabold"
              style={{ color: W.ink }}
            >
              ขั้นตอนถัดไป
            </p>
            <p
              className="mt-0.5 text-[13px] font-medium"
              style={{ color: W.muted }}
            >
              ทำ 3 อย่างนี้ก่อนเปิดขายจริง
            </p>

            <WelcomeNextStepsFlow steps={steps} />
          </section>

          <div className="mt-6 space-y-3 pb-2">
            <Link
              href="/owner?tab=sell&setupBrand=1"
              className="grid min-h-[3.75rem] w-full grid-cols-[1fr_auto] items-center rounded-[1.125rem] px-5 text-[17px] font-bold text-white transition-all duration-200 hover:brightness-[1.03] active:scale-[0.99]"
              style={{
                background: `linear-gradient(90deg, ${W.mid} 0%, ${W.bright} 50%, ${W.teal} 100%)`,
                boxShadow: "0 10px 28px -8px rgba(16,185,129,0.55)",
              }}
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

            <p
              className="pt-2 text-center text-[15px]"
              style={{ color: W.muted }}
            >
              มีบัญชีแล้ว?{" "}
              <Link
                href="/owner/login"
                className="font-bold transition-opacity hover:underline hover:opacity-85"
                style={{ color: W.mid }}
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

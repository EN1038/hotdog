"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PlatformMark } from "@/components/PlatformMark";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  formatTrialEndsAt,
  formatDaysRemaining,
  daysUntilDate,
} from "@/components/admin/BrandPlanBanner";
import { OWNER_REGISTER_TRIAL_DAYS } from "@/lib/owner-register-shared";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

type WelcomePayload = {
  brandName: string;
  subscription: {
    trialEndsAt: string | null;
    planLabel: string;
    status: string;
  } | null;
  branches: Array<{ id: string; name: string }>;
};

const START_STEPS = [
  {
    n: 1,
    title: "ตั้งเมนูและราคา",
    hint: "ถ้ายังไม่ได้นำเข้าจากแม่แบบ",
  },
  {
    n: 2,
    title: "เปิดรอบขาย",
    hint: "ที่หน้าร้าน / มือถือพนักงาน",
  },
  {
    n: 3,
    title: "เชิญพนักงาน",
    hint: "ด้วยเบอร์โทร — ล็อกอิน OTP",
  },
] as const;

function CheckRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white"
        aria-hidden
      >
        ✓
      </span>
      <span className="text-[14px] font-semibold leading-snug text-slate-800">
        {children}
      </span>
    </li>
  );
}

export default function OwnerWelcomePage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const [data, setData] = useState<WelcomePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    if (!session) {
      router.replace("/owner/register");
      return;
    }
    if (session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/owner/dashboard?period=day");
        if (!res.ok) {
          router.replace("/owner/login");
          return;
        }
        const payload = await res.json();
        setData({
          brandName: payload.brand?.name ?? "ร้านของคุณ",
          subscription: payload.subscription ?? null,
          branches: (payload.branches ?? []).filter(
            (b: { isHidden?: boolean; kind?: string }) =>
              !b.isHidden && b.kind !== "WAREHOUSE",
          ),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loaded, session, router]);

  const trialEnds = data?.subscription?.trialEndsAt ?? null;
  const trialLabel = formatTrialEndsAt(trialEnds);
  const daysLeft = daysUntilDate(trialEnds);
  const daysLeftText = formatDaysRemaining(daysLeft);
  const branchName =
    data?.branches.find((b) => b.name.includes("หลัก"))?.name ??
    data?.branches[0]?.name ??
    "สาขาหลัก";
  const trialProgress =
    daysLeft != null && daysLeft >= 0
      ? Math.round(
          ((OWNER_REGISTER_TRIAL_DAYS - daysLeft) / OWNER_REGISTER_TRIAL_DAYS) *
            100,
        )
      : 0;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#eef6f1]">
      <div
        className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-emerald-300/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 top-32 h-48 w-48 rounded-full bg-teal-200/40 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex justify-center">
          <PlatformMark placement="login" height={34} priority />
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-emerald-200" />
            <p className="text-sm font-medium text-slate-500">กำลังเตรียมร้าน…</p>
          </div>
        ) : (
          <>
            <section className="mt-6 overflow-hidden rounded-[1.75rem] bg-white shadow-[0_12px_40px_-12px_rgba(16,94,57,0.25)] ring-1 ring-emerald-100/80">
              <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 px-6 pb-8 pt-7 text-center text-white">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-3xl shadow-inner ring-1 ring-white/20 backdrop-blur-sm">
                  🎉
                </div>
                <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-emerald-100/90">
                  เปิดร้านสำเร็จ
                </p>
                <h1 className="mt-2 text-[26px] font-black leading-tight">
                  ยินดีต้อนรับ!
                </h1>
                <p className="mt-3 text-[18px] font-extrabold leading-snug">
                  {data?.brandName}
                </p>
                <p className="mt-2 text-[13px] font-medium text-emerald-50/90">
                  พร้อมทดลองใช้ระบบขายและจัดการร้าน
                </p>
              </div>

              <div className="relative -mt-5 px-4 pb-5">
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/60 p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center">
                      <svg
                        className="absolute inset-0 -rotate-90"
                        viewBox="0 0 36 36"
                        aria-hidden
                      >
                        <circle
                          cx="18"
                          cy="18"
                          r="15.5"
                          fill="none"
                          stroke="#d1fae5"
                          strokeWidth="3"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.5"
                          fill="none"
                          stroke="#059669"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${Math.max(8, trialProgress)} 100`}
                        />
                      </svg>
                      <div className="text-center">
                        <p className="text-[20px] font-black tabular-nums text-emerald-800">
                          {daysLeft != null && daysLeft >= 0
                            ? daysLeft
                            : OWNER_REGISTER_TRIAL_DAYS}
                        </p>
                        <p className="text-[10px] font-bold text-emerald-700/80">
                          วัน
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-extrabold text-emerald-950">
                        ทดลองใช้ฟรี {OWNER_REGISTER_TRIAL_DAYS} วัน
                      </p>
                      {trialLabel ? (
                        <p className="mt-0.5 text-[13px] font-semibold text-emerald-800/90">
                          ถึง {trialLabel}
                          {daysLeftText ? ` · ${daysLeftText}` : ""}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        ลองครบทุกฟีเจอร์ รวมสต๊อก · ครัว · รายงาน
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                สิ่งที่พร้อมแล้ว
              </p>
              <ul className="space-y-2">
                <CheckRow>สร้างร้าน {data?.brandName}</CheckRow>
                <CheckRow>สาขา {branchName} พร้อมใช้งาน</CheckRow>
                {data?.subscription?.planLabel ? (
                  <CheckRow>แพ็ก {data.subscription.planLabel}</CheckRow>
                ) : null}
              </ul>
            </section>

            <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-[15px] font-extrabold text-slate-900">
                ขั้นตอนถัดไป
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                ทำ 3 อย่างนี้ก่อนเปิดขายจริง
              </p>
              <ol className="mt-3 space-y-2">
                {START_STEPS.map((step) => (
                  <li
                    key={step.n}
                    className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-sm font-black text-white">
                      {step.n}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-slate-900">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                        {step.hint}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <div className="mt-auto space-y-2.5 pt-6">
              <Link
                href="/owner"
                className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 text-[16px] font-extrabold text-white shadow-lg shadow-emerald-900/15 active:scale-[0.99]"
              >
                เริ่มใช้งาน
              </Link>
              <a
                href={PLATFORM_LINE_ADD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[14px] font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#06C755] text-[10px] font-black text-white">
                  LINE
                </span>
                ติดต่อทีมงาน
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

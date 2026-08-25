"use client";

import {
  PLATFORM_APP_NAME,
  PLATFORM_APP_VERSION,
  PLATFORM_LINE_ADD_URL,
  PLATFORM_SUPPORT_BLURB,
} from "@/lib/platform-support";

export function PlatformSupportCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-extrabold text-slate-900">ติดต่อเรา</h2>
        <p className="shrink-0 text-[12px] font-bold tabular-nums text-slate-400">
          v{PLATFORM_APP_VERSION}
        </p>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        {PLATFORM_SUPPORT_BLURB}
      </p>

      <dl className="mt-3 space-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-medium text-slate-500">แอป</dt>
          <dd className="font-bold text-slate-900">{PLATFORM_APP_NAME}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-medium text-slate-500">เวอร์ชัน</dt>
          <dd className="font-bold tabular-nums text-slate-900">
            {PLATFORM_APP_VERSION}
          </dd>
        </div>
      </dl>

      <a
        href={PLATFORM_LINE_ADD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm active:brightness-95"
      >
        <span aria-hidden>💬</span>
        แอดไลน์สอบถาม / แจ้งปัญหา
      </a>
    </section>
  );
}

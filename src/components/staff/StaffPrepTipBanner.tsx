"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StaffPrepTip } from "@/lib/sales-day-insights";

type PrepTipPayload = {
  tip: StaffPrepTip | null;
  canViewFull?: boolean;
  fullHref?: string | null;
};

/** แบนเนอร์สั้น: พรุ่งนี้/วันนี้ขายดีหรือยอดอ่อน — สำหรับพนักงาน */
export function StaffPrepTipBanner({
  className = "",
}: {
  className?: string;
}) {
  const [payload, setPayload] = useState<PrepTipPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/prep-tip");
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        setPayload(data as PrepTipPayload);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tip = payload?.tip;
  if (!tip) return null;

  const hot = tip.kind === "peak" || tip.kind === "strong";
  const wrap = hot
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : "border-amber-200 bg-amber-50 text-amber-950";
  const eyebrow = hot ? "text-emerald-800" : "text-amber-800";

  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-sm ${wrap} ${className}`}
      role="status"
    >
      <p className={`text-[11px] font-bold uppercase tracking-wide ${eyebrow}`}>
        เตรียมของวันนี้
      </p>
      <p className="mt-0.5 text-[15px] font-extrabold leading-snug">
        {tip.title}
      </p>
      <p className="mt-0.5 text-[12px] font-semibold opacity-80">
        {tip.subtitle}
      </p>
      {payload?.canViewFull && payload.fullHref ? (
        <Link
          href={payload.fullHref}
          className="mt-2 inline-block text-[12px] font-bold underline underline-offset-2 opacity-90"
        >
          ดูวันขายดี / ยอดอ่อนทั้งหมด →
        </Link>
      ) : null}
    </div>
  );
}

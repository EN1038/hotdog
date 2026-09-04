"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AdminLoadingState,
  AdminPageHeader,
  adminCardClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import type { PlatformOpsDashboard } from "@/lib/platform-ops-metrics";

function StatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "slate" | "amber" | "emerald" | "rose" | "sky";
}) {
  const tones = {
    slate: "border-slate-200 from-slate-50",
    amber: "border-amber-200 from-amber-50",
    emerald: "border-emerald-200 from-emerald-50",
    rose: "border-rose-200 from-rose-50",
    sky: "border-sky-200 from-sky-50",
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br to-white p-4 shadow-sm ${tones[tone]}`}
    >
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function BrandList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: PlatformOpsDashboard["trialEnding3d"];
}) {
  return (
    <section className={`${adminCardClass} space-y-3`}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/brands/${b.id}`}
                  className="font-semibold text-slate-900 hover:underline"
                >
                  {b.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {b.code}
                  {b.daysLeft != null ? ` · เหลือ ${b.daysLeft} วัน` : ""}
                  {b.contactPhone ? ` · ${b.contactPhone}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {b.effectiveStatus}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminPlatformOpsPage() {
  const { session, loaded: sessionLoaded } = useAdminSession();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PlatformOpsDashboard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/platform-ops");
      if (res.status === 403) {
        router.replace("/admin");
        return;
      }
      if (!res.ok) throw new Error("โหลดไม่สำเร็จ");
      setData((await res.json()) as PlatformOpsDashboard);
    } catch {
      toast.error("โหลดภาพรวมแพลตฟอร์มไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    if (!sessionLoaded) return;
    if (!session) {
      router.replace("/admin/login");
      return;
    }
    if (!session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    void load();
  }, [session, sessionLoaded, router, load]);

  async function runNotifyJobs() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/platform-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runNotifyJobs: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "ส่งไม่สำเร็จ");
      toast.success("รันแจ้งเตือน LINE แล้ว", "รายการซ้ำในวันนี้จะถูกข้าม");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!sessionLoaded || loading || !data) {
    return <AdminLoadingState />;
  }

  const c = data.counts;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="ภาพรวมแพลตฟอร์ม"
        description="ติดตามยอดสมัคร ทดลองใกล้หมด แบรนด์หยุดใช้/หมดอายุ และสัญญาณระบบ — แจ้ง LINE ได้จาก /admin/line"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => void load()}
            >
              รีเฟรช
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() => void runNotifyJobs()}
            >
              {busy ? "กำลังส่ง…" : "ส่งแจ้งเตือน LINE ตอนนี้"}
            </button>
            <Link href="/admin/line" className={btnOutline}>
              ตั้งค่า LINE
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="ทดลองใช้" value={c.trial} tone="amber" />
        <StatCard label="ใช้งานอยู่" value={c.active} tone="emerald" />
        <StatCard label="หยุดใช้" value={c.paused} tone="slate" />
        <StatCard label="หมดอายุ" value={c.expired} tone="rose" />
        <StatCard
          label="สมัครใหม่วันนี้"
          value={c.registeredToday}
          tone="sky"
          hint={data.dayKey}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ทดลองใกล้หมด 3 วัน"
          value={c.trialEnding3d}
          tone="amber"
        />
        <StatCard
          label="ทดลองใกล้หมด 1 วัน"
          value={c.trialEnding1d}
          tone="rose"
        />
        <StatCard
          label="สมัครแล้วนิ่ง"
          value={c.inactiveOnboard}
          hint="24 ชม.–7 วัน ยังไม่มีออเดอร์"
          tone="sky"
        />
        <StatCard
          label="SMS ล้มเหลว 6 ชม."
          value={c.smsFailed6h}
          tone={c.smsFailed6h >= 5 ? "rose" : "slate"}
          hint="เกณฑ์แจ้ง LINE ≥ 5"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <BrandList
          title="ทดลองใกล้หมด (1 วัน)"
          empty="ไม่มีรายการ"
          rows={data.trialEnding1d}
        />
        <BrandList
          title="ทดลองใกล้หมด (3 วัน)"
          empty="ไม่มีรายการ"
          rows={data.trialEnding3d}
        />
        <BrandList
          title="หยุดใช้ (PAUSED)"
          empty="ไม่มีรายการ"
          rows={data.paused}
        />
        <BrandList
          title="หมดอายุ (EXPIRED)"
          empty="ไม่มีรายการ"
          rows={data.expired}
        />
        <BrandList
          title="สมัครแล้วยังไม่เริ่มใช้"
          empty="ไม่มีรายการ"
          rows={data.inactiveOnboard}
        />
        <BrandList
          title="สมัครใหม่วันนี้"
          empty="ยังไม่มีการสมัครวันนี้"
          rows={data.registeredToday}
        />
      </div>

      <p className="text-xs text-slate-500">
        Cron:{" "}
        <code className="rounded bg-slate-100 px-1">
          /api/cron/platform-ops
        </code>{" "}
        (ต้องมี CRON_SECRET) — แนะนำเรียกวันละ 1–2 รอบ
      </p>
    </div>
  );
}

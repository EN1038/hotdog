import Link from "next/link";
import type { BrandSmsQuotaSnapshot } from "@/lib/brand-sms-quota";

type OwnerSmsQuotaCardProps = {
  quota: BrandSmsQuotaSnapshot;
  /** Show link to notification settings */
  manageHref?: string;
  className?: string;
};

function usagePercent(quota: BrandSmsQuotaSnapshot): number {
  if (quota.granted <= 0) return quota.used > 0 ? 100 : 0;
  return Math.min(100, Math.round((quota.used / quota.granted) * 100));
}

export function OwnerSmsQuotaCard({
  quota,
  manageHref = "/owner/settings#sms-quota",
  className = "",
}: OwnerSmsQuotaCardProps) {
  const percent = usagePercent(quota);
  const depleted = quota.granted <= 0 || quota.remaining <= 0;
  const low = !depleted && quota.granted > 0 && quota.remaining <= Math.max(5, Math.ceil(quota.granted * 0.1));

  const tone = depleted
    ? {
        wrap: "border-amber-200 bg-amber-50/70",
        bar: "bg-amber-500",
        label: "text-amber-900",
        sub: "text-amber-800",
      }
    : low
      ? {
          wrap: "border-amber-200 bg-amber-50/50",
          bar: "bg-amber-400",
          label: "text-amber-900",
          sub: "text-amber-800",
        }
      : {
          wrap: "border-emerald-200 bg-emerald-50/60",
          bar: "bg-emerald-500",
          label: "text-emerald-900",
          sub: "text-emerald-800",
        };

  return (
    <section
      id="sms-quota"
      className={`rounded-2xl border p-4 shadow-sm ${tone.wrap} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[12px] font-semibold ${tone.sub}`}>
            โควตา SMS แจ้งเตือน
          </p>
          <p className={`mt-0.5 text-[15px] font-black ${tone.label}`}>
            คงเหลือ {quota.remaining.toLocaleString("th-TH")} ฉบับ
          </p>
        </div>
        {manageHref ? (
          <Link
            href={manageHref}
            className="shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-[12px] font-bold text-slate-700 ring-1 ring-black/5"
          >
            ตั้งค่า
          </Link>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-black/5">
          <p className="text-[11px] font-semibold text-slate-500">โควตารวม</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
            {quota.granted.toLocaleString("th-TH")}
          </p>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-black/5">
          <p className="text-[11px] font-semibold text-slate-500">ใช้แล้ว</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
            {quota.used.toLocaleString("th-TH")}
          </p>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-black/5">
          <p className="text-[11px] font-semibold text-slate-500">คงเหลือ</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">
            {quota.remaining.toLocaleString("th-TH")}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
          <span>การใช้งาน</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5">
          <div
            className={`h-full rounded-full transition-all ${tone.bar}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {depleted ? (
        <p className={`mt-3 text-[12px] font-semibold ${tone.sub}`}>
          โควตาหมดหรือยังไม่ได้รับโควตา — SMS แจ้งเตือนจะไม่ถูกส่งจนกว่าทีม SkillSale จะเติมให้
        </p>
      ) : low ? (
        <p className={`mt-3 text-[12px] font-semibold ${tone.sub}`}>
          โควตาใกล้หมด — ติดต่อทีม SkillSale เพื่อเติมเพิ่ม
        </p>
      ) : (
        <p className={`mt-3 text-[12px] ${tone.sub}`}>
          นับเฉพาะ SMS แจ้งเตือนออเดอร์และสั่งเสียบไม้ — ไม่รวม OTP และ SMS ถึงลูกค้า
        </p>
      )}
    </section>
  );
}

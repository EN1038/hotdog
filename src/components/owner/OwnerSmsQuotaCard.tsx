import type { BrandSmsQuotaSnapshot } from "@/lib/brand-sms-quota";

type OwnerSmsQuotaCardProps = {
  quota: BrandSmsQuotaSnapshot;
  className?: string;
};

function usagePercent(quota: BrandSmsQuotaSnapshot): number {
  if (quota.granted <= 0) return quota.used > 0 ? 100 : 0;
  return Math.min(100, Math.round((quota.used / quota.granted) * 100));
}

export function OwnerSmsQuotaCard({
  quota,
  className = "",
}: OwnerSmsQuotaCardProps) {
  const percent = usagePercent(quota);
  const depleted = quota.granted <= 0 || quota.remaining <= 0;
  const low =
    !depleted &&
    quota.granted > 0 &&
    quota.remaining <= Math.max(5, Math.ceil(quota.granted * 0.1));

  const status = depleted
    ? { label: "หมดแล้ว", pill: "bg-amber-100 text-amber-900", bar: "bg-amber-500" }
    : low
      ? { label: "ใกล้หมด", pill: "bg-amber-100 text-amber-900", bar: "bg-amber-400" }
      : { label: "พร้อมใช้", pill: "bg-site-primary-soft text-site-primary-strong", bar: "bg-site-primary" };

  return (
    <section
      id="sms-quota"
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}
    >
      <div className="bg-gradient-to-br from-site-primary-soft via-white to-white px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-slate-500">
              โควตา SMS แจ้งเตือน
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[32px] font-black leading-none tabular-nums tracking-tight text-slate-900">
                {quota.remaining.toLocaleString("th-TH")}
              </span>
              <span className="text-[14px] font-bold text-slate-500">ฉบับคงเหลือ</span>
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.pill}`}
          >
            {status.label}
          </span>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-slate-500">
            <span>
              ใช้ไป {quota.used.toLocaleString("th-TH")} จาก{" "}
              {quota.granted.toLocaleString("th-TH")} ฉบับ
            </span>
            <span className="tabular-nums text-slate-700">{percent}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${status.bar}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        {depleted ? (
          <p className="text-[12px] font-medium leading-relaxed text-amber-800">
            โควตาหมดหรือยังไม่ได้รับโควตา SMS แจ้งเตือนจะยังไม่ถูกส่ง
            จนกว่าทีม SkillSale จะเติมให้
          </p>
        ) : low ? (
          <p className="text-[12px] font-medium leading-relaxed text-amber-800">
            โควตาใกล้หมดแล้ว ติดต่อทีม SkillSale เพื่อเติมเพิ่ม
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed text-slate-500">
            นับเฉพาะ SMS แจ้งเตือนออเดอร์และสั่งเสียบไม้
            ไม่รวมรหัสยืนยันและ SMS ถึงลูกค้า
          </p>
        )}
      </div>
    </section>
  );
}

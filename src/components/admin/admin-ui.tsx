"use client";

export { LoadingState as AdminLoadingState } from "@/components/LoadingState";

export const adminInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-site-primary focus:outline-none focus:ring-2 ring-site-primary";

export const adminLabelClass =
  "mb-1.5 block text-sm font-semibold text-slate-700";

export const adminCardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export const adminTableWrapClass =
  "overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm";

export const adminTableClass = "min-w-full text-left text-sm";

export const adminTheadClass =
  "border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500";

export const adminThClass = "px-4 py-3 font-semibold";

export const adminTrClass = "border-b border-slate-100 last:border-b-0";

export const adminTrHoverClass =
  "border-b border-slate-100 last:border-b-0 hover:bg-slate-50";

export const adminSelectClass = adminInputClass;

export const adminEmptyClass =
  "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center shadow-sm";

export const btnPrimary =
  "cursor-pointer rounded-xl bg-site-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-site-primary-hover hover:shadow active:bg-site-primary-active disabled:cursor-not-allowed disabled:opacity-50";

export const btnDark =
  "cursor-pointer rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-900 hover:shadow active:bg-black disabled:cursor-not-allowed disabled:opacity-50";

export const btnOutline =
  "cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

/** ปุ่มทำลาย / ลบ — คงสีแดงไว้เพื่อความหมาย */
export const btnDanger =
  "cursor-pointer rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-800 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimaryXl =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-site-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-site-primary-hover hover:shadow active:bg-site-primary-active disabled:cursor-not-allowed disabled:opacity-50";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={adminEmptyClass}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 7h16M4 12h10M4 17h7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

"use client";

import Link from "next/link";

export function ShopBrandHeader({
  brandCode,
  brandName,
  logoUrl,
  branchCount,
  href,
}: {
  brandCode: string;
  brandName: string;
  logoUrl: string | null;
  branchCount: number;
  /** Override link target; default brand hub */
  href?: string;
}) {
  return (
    <Link
      href={href ?? `/${brandCode}`}
      className="flex items-center gap-3 rounded-2xl px-1 py-1.5 transition active:opacity-80"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-gray-100">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[15px] font-extrabold text-site-primary">
            {brandName.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-extrabold text-gray-900">
          {brandName}
        </span>
        <span className="block text-[12px] text-gray-500">
          {branchCount} สาขา · ดูทั้งหมด
        </span>
      </span>
      <span className="text-gray-400" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}

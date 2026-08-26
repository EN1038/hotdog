"use client";

import { use } from "react";
import Link from "next/link";
import {
  SkewerAppShell,
  useSkewerBranchMeta,
} from "@/components/skewer/SkewerAppShell";
import { LoadingState } from "@/components/LoadingState";
import { brandColorFromApi } from "@/lib/color";

type PageProps = { params: Promise<{ branchId: string }> };

export default function SkewerHomePage({ params }: PageProps) {
  const { branchId } = use(params);
  const meta = useSkewerBranchMeta(branchId);
  const accent = brandColorFromApi(meta.brandColor);

  return (
    <SkewerAppShell branchId={branchId} active="home" meta={meta}>
      {meta.loading ? (
        <div className="px-4 py-8">
          <LoadingState className="border-0 bg-transparent shadow-none" />
        </div>
      ) : meta.error ? (
        <div className="px-4 pt-4">
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {meta.error}
          </p>
        </div>
      ) : (
        <div className="space-y-4 px-4 pb-6 pt-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">เมนูด่วน</p>
              <span className="text-xs font-medium text-slate-400">
                เลือกงานที่ต้องการทำ
              </span>
            </div>
            <div className="space-y-4">
              <Link
                href={`/skewer/${branchId}/order`}
                className="flex w-full items-center justify-between rounded-2xl p-6 text-left text-white shadow-md transition-transform active:scale-[0.98]"
                style={{ backgroundColor: "#0ea5e9" }}
              >
                <div className="min-w-0 pr-2">
                  <h3 className="truncate text-2xl font-black drop-shadow-sm">
                    สั่งเสียบไม้
                  </h3>
                  <p className="mt-1 text-sm font-medium text-white/90">
                    เลือกเมนู · วันที่ต้องการ · ที่อยู่
                  </p>
                </div>
                <div className="shrink-0 text-4xl" aria-hidden>
                  🍢
                </div>
              </Link>

              <Link
                href={`/skewer/${branchId}/history`}
                className="flex w-full items-center justify-between rounded-2xl p-6 text-left text-white shadow-md transition-transform active:scale-[0.98]"
                style={{ backgroundColor: accent }}
              >
                <div className="min-w-0 pr-2">
                  <h3 className="truncate text-2xl font-black drop-shadow-sm">
                    ประวัติการสั่ง
                  </h3>
                  <p className="mt-1 text-sm font-medium text-white/90">
                    ดูสถานะและจำนวนไม้ที่ยืนยันแล้ว
                  </p>
                </div>
                <div className="shrink-0 text-4xl" aria-hidden>
                  📝
                </div>
              </Link>
            </div>
          </section>

          <p className="px-1 text-center text-xs text-slate-500">
            หลังสั่งรอแอดมินโทรยืนยัน
          </p>
        </div>
      )}
    </SkewerAppShell>
  );
}

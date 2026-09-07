"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  OwnerAppShell,
  useOwnerDashboard,
} from "@/components/owner/OwnerAppShell";
import { AccountsLedgerView } from "@/components/accounts/AccountsLedgerView";
import { IconBack, IconChevronRight } from "@/components/icons";
import type { OwnerBranchRow } from "@/lib/owner-dashboard";

function accountBranches(branches: OwnerBranchRow[] | undefined) {
  return (branches ?? []).filter(
    (b) => !b.isHidden && !b.isTest && b.kind !== "WAREHOUSE",
  );
}

function OwnerAccountsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading } = useOwnerDashboard();
  const branchIdParam = searchParams.get("branchId")?.trim() || null;

  const branches = useMemo(
    () => accountBranches(data?.branches),
    [data?.branches],
  );

  const selected = useMemo(() => {
    if (!branchIdParam) return null;
    return branches.find((b) => b.id === branchIdParam) ?? null;
  }, [branchIdParam, branches]);

  useEffect(() => {
    if (loading || !data) return;
    if (branches.length === 1 && !branchIdParam) {
      router.replace(`/owner/accounts?branchId=${branches[0]!.id}`);
    }
  }, [loading, data, branches, branchIdParam, router]);

  const brandName = data?.brand?.name ?? data?.brand?.nameTh ?? "";

  if (loading && !data) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        กำลังโหลด…
      </p>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="px-4 pb-28 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <Link
            href="/owner"
            aria-label="กลับหน้าหลัก"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <IconBack size={22} />
          </Link>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">บัญชี</h1>
            <p className="text-xs font-medium text-slate-500">
              รายรับ · รายจ่าย · ภาพรวม
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
          <p className="text-sm font-bold text-slate-700">ยังไม่มีสาขา</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            เพิ่มสาขาก่อนเพื่อบันทึกรายรับ–รายจ่าย
          </p>
          <Link
            href="/owner/branches"
            className="mt-4 inline-flex rounded-xl bg-site-primary px-4 py-2.5 text-sm font-bold text-white"
          >
            ไปจัดการสาขา
          </Link>
        </div>
      </div>
    );
  }

  if (branches.length > 1 && !selected) {
    return (
      <div className="px-4 pb-28 pt-3">
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/owner"
            aria-label="กลับหน้าหลัก"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <IconBack size={22} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-slate-900">บัญชี</h1>
            <p className="text-xs font-medium text-slate-500">
              เลือกสาขาเพื่อดูและบันทึกรายรับ–รายจ่าย
            </p>
          </div>
        </div>
        <ul className="space-y-2" aria-label="เลือกสาขา">
          {branches.map((b) => (
            <li key={b.id}>
              <Link
                href={`/owner/accounts?branchId=${b.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 active:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">
                    {b.name}
                  </p>
                  {b.code ? (
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      {b.code}
                    </p>
                  ) : null}
                </div>
                <IconChevronRight size={18} className="shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (branchIdParam && !selected && branches.length > 0) {
    return (
      <div className="px-4 pb-28 pt-3">
        <p className="py-8 text-center text-sm text-slate-500">
          ไม่พบสาขาที่เลือก
        </p>
        <div className="text-center">
          <Link
            href="/owner/accounts"
            className="text-sm font-bold text-site-primary"
          >
            เลือกสาขาใหม่
          </Link>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        กำลังเปิดบัญชีสาขา…
      </p>
    );
  }

  const multi = branches.length > 1;
  const accountsPath = `/owner/accounts?branchId=${selected.id}`;

  return (
    <AccountsLedgerView
      apiMode="owner"
      branchId={selected.id}
      backHref={multi ? "/owner/accounts" : "/owner"}
      brandName={brandName}
      branchName={selected.name}
      changeBranchHref={multi ? "/owner/accounts" : null}
      loginRedirect="/owner/login"
      accountsPath={accountsPath}
      bottomPadClassName="pb-40"
      fabBottomClassName="bottom-[5.25rem]"
    />
  );
}

export default function OwnerAccountsPage() {
  return (
    <OwnerAppShell active="home">
      <Suspense
        fallback={
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            กำลังโหลด…
          </p>
        }
      >
        <OwnerAccountsInner />
      </Suspense>
    </OwnerAppShell>
  );
}

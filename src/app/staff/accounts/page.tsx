"use client";

import { Suspense, type ReactNode } from "react";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { AccountsLedgerView } from "@/components/accounts/AccountsLedgerView";

function StaffAccountsInner() {
  return (
    <AccountsLedgerView
      apiMode="staff"
      backHref="/staff"
      loginRedirect="/staff/login"
      accountsPath="/staff/accounts"
      wrap={(content: ReactNode) => (
        <StaffAppShell active="home">{content}</StaffAppShell>
      )}
    />
  );
}

export default function StaffAccountsPage() {
  return (
    <Suspense
      fallback={
        <StaffAppShell active="home">
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            กำลังโหลด…
          </p>
        </StaffAppShell>
      }
    >
      <StaffAccountsInner />
    </Suspense>
  );
}

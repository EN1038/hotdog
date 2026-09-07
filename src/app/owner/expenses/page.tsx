"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell } from "@/components/owner/OwnerAppShell";

function OwnerExpensesRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const branchId = searchParams.get("branchId")?.trim();
    const q = branchId
      ? `?branchId=${encodeURIComponent(branchId)}`
      : "";
    router.replace(`/owner/accounts${q}`);
  }, [router, searchParams]);

  return (
    <p className="px-4 py-10 text-center text-sm text-slate-500">
      กำลังเปิดหน้าบัญชี…
    </p>
  );
}

/** Legacy deep link — redirects to /owner/accounts */
export default function OwnerExpensesPage() {
  return (
    <OwnerAppShell active="home">
      <Suspense
        fallback={
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            กำลังเปิดหน้าบัญชี…
          </p>
        }
      >
        <OwnerExpensesRedirect />
      </Suspense>
    </OwnerAppShell>
  );
}

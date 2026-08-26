"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OwnerAppShell } from "@/components/owner/OwnerAppShell";
import { OwnerBranchSwitcher } from "@/components/owner/OwnerBranchSwitcher";
import { IconBack } from "@/components/icons";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  counterpartBranchAdminPath,
  isOwnerBranchAdminPath,
} from "@/lib/branch-admin-path";
import { resolveOwnerView } from "@/lib/owner-view-preference";

type Props = {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function OwnerBranchShell({
  children,
  backHref = "/owner",
  backLabel = "กลับหน้าแรก",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useAdminSession();

  useEffect(() => {
    if (!session || session.isPlatformAdmin) return;
    if (resolveOwnerView() !== "desktop") return;
    const qs = searchParams.toString();
    const search = qs ? `?${qs}` : "";
    const target = counterpartBranchAdminPath(pathname, search);
    if (target?.startsWith("/admin/")) {
      router.replace(target);
    }
  }, [pathname, router, searchParams, session]);

  return (
    <OwnerAppShell active="settings">
      <div className="px-4 pt-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-site-primary"
        >
          <IconBack size={16} />
          {backLabel}
        </Link>
      </div>
      {isOwnerBranchAdminPath(pathname) ? (
        <div className="px-4 pb-3 pt-1">
          <OwnerBranchSwitcher />
        </div>
      ) : null}
      <div className="px-4 pb-4">{children}</div>
    </OwnerAppShell>
  );
}

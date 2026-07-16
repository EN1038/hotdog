"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminLoadingState } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { BranchListDashboard } from "@/components/admin/BranchListDashboard";
import { PlatformBrandsHome } from "@/components/admin/PlatformBrandsHome";

export default function AdminDashboard() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();

  useEffect(() => {
    if (loaded && !session) {
      router.replace("/admin/login");
    }
  }, [loaded, session, router]);

  if (!loaded || !session) {
    return <AdminLoadingState />;
  }

  // Platform: brand list home · Brand admin: branch cards for their brand(s)
  if (session.isPlatformAdmin) {
    return <PlatformBrandsHome />;
  }

  const soleBrandId =
    session.brandIds.length === 1 ? session.brandIds[0] : undefined;

  return <BranchListDashboard lockedBrandId={soleBrandId} />;
}

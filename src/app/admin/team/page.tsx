"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminLoadingState } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";

/** Brand admins land here to see their brand's admin IDs. */
export default function BrandTeamRedirectPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();

  useEffect(() => {
    if (!loaded) return;
    if (!session) {
      router.replace("/admin/login");
      return;
    }
    if (session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    const brandId = session.brandIds[0];
    if (!brandId) {
      router.replace("/admin");
      return;
    }
    router.replace(`/admin/brands/${brandId}/admins`);
  }, [loaded, session, router]);

  return <AdminLoadingState />;
}

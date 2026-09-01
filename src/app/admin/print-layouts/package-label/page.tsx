"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminLoadingState } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";

type BrandItem = { id: string; name: string };

export default function PackageLabelLayoutQuickAccessPage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();

  useEffect(() => {
    if (!loaded) return;

    if (session?.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }

    fetch("/api/admin/brands")
      .then((res) => (res.ok ? res.json() : []))
      .then((brands: BrandItem[]) => {
        if (brands.length === 1) {
          router.replace(
            `/admin/brands/${brands[0].id}/print-layouts/package-label`,
          );
          return;
        }
        if (brands.length > 0) {
          router.replace(
            `/admin/brands/${brands[0].id}/print-layouts/package-label`,
          );
          return;
        }
        router.replace("/admin");
      })
      .catch(() => router.replace("/admin"));
  }, [loaded, router, session]);

  return <AdminLoadingState className="py-12" />;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AdminLoadingState,
  btnOutline,
} from "@/components/admin/AdminShell";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  BranchListDashboard,
  type DashboardBrand,
} from "@/components/admin/BranchListDashboard";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";

type BrandDetail = DashboardBrand & {
  logoUrl?: string | null;
};

export default function BrandBranchesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const [brand, setBrand] = useState<BrandDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;

    if (session && !session.isPlatformAdmin) {
      if (!session.brandIds.includes(id)) {
        router.replace("/admin");
        return;
      }
    }

    fetch(`/api/admin/brands/${id}`).then(async (res) => {
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.status === 403 || res.status === 404) {
        router.replace("/admin");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setBrand({
          id: data.id,
          name: data.name,
          code: data.code,
          color: data.color,
          logoUrl: data.logoUrl,
          kitchenEnabled: data.kitchenEnabled,
          bbqEnabled: data.bbqEnabled,
          skewerEnabled: data.skewerEnabled,
          maxBranches: data.maxBranches,
          plan: data.plan,
        });
      }
      setLoading(false);
    });
  }, [id, loaded, session, router]);

  if (!loaded || loading || !brand) {
    return <AdminLoadingState />;
  }

  const isPlatform = Boolean(session?.isPlatformAdmin);

  return (
    <BranchListDashboard
      lockedBrandId={brand.id}
      brandMeta={brand}
      title={brand.name}
      description={`สาขาภายใต้แบรนด์ /${brand.code}`}
      backHref={isPlatform ? "/admin" : undefined}
      backLabel="กลับไปเลือกแบรนด์"
      headerActions={
        <div className="flex flex-wrap gap-2">
          {WAREHOUSE_UI_ENABLED && brand.kitchenEnabled ? (
            <Link
              href={`/admin/brands/${brand.id}/kitchen`}
              className={btnOutline}
            >
              ครัว / ผลิต
            </Link>
          ) : null}
          {WAREHOUSE_UI_ENABLED ? (
            <Link
              href={`/admin/brands/${brand.id}/stock`}
              className={btnOutline}
            >
              สต๊อก / สต๊อกกลาง
            </Link>
          ) : null}
          <Link
            href={`/admin/brands/${brand.id}/print-layouts/package-label`}
            className={btnOutline}
          >
            แบบป้ายแพ็ก
          </Link>
          <Link
            href={`/admin/brands/${brand.id}/admins`}
            className={btnOutline}
          >
            บัญชีเจ้าของ
          </Link>
        </div>
      }
    />
  );
}

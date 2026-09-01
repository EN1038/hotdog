"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AdminLoadingState,
  btnOutline,
} from "@/components/admin/AdminShell";
import { PackageLabelLayoutEditor } from "@/components/admin/PackageLabelLayoutEditor";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { IconBack } from "@/components/icons";

type BrandMeta = {
  id: string;
  name: string;
  code: string;
};

export default function BrandPackageLabelLayoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const [brand, setBrand] = useState<BrandMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;

    if (session && !session.isPlatformAdmin && !session.brandIds.includes(id)) {
      router.replace("/admin");
      return;
    }

    fetch(`/api/admin/brands/${id}`)
      .then(async (res) => {
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
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, loaded, session, router]);

  if (!loaded || loading || !brand) {
    return <AdminLoadingState />;
  }

  const isPlatform = Boolean(session?.isPlatformAdmin);
  const backHref = isPlatform
    ? `/admin/brands/${brand.id}`
    : "/admin/brands";

  return (
    <div>
      <div className="mb-4">
        <Link href={backHref} className={`${btnOutline} inline-flex items-center gap-1.5`}>
          <IconBack size={16} />
          {isPlatform ? `กลับ ${brand.name}` : "กลับโปรไฟล์แบรนด์"}
        </Link>
      </div>
      <PackageLabelLayoutEditor
        brandId={brand.id}
        brandName={brand.name}
        backHref={backHref}
        backLabel={isPlatform ? `กลับ ${brand.name}` : "กลับโปรไฟล์แบรนด์"}
      />
    </div>
  );
}

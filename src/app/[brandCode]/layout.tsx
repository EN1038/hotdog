import { cache } from "react";
import type { Metadata } from "next";
import { OrderBrandingShell } from "@/components/customer/OrderBrandingShell";
import { prisma } from "@/lib/db";
import { localizedName } from "@/lib/localized";

type Params = { params: Promise<{ brandCode: string }> };

/**
 * Only used by generateMetadata — cache() ensures a single DB call per request.
 * BrandLayout itself does NOT call Prisma to avoid RSC 500 on connection drop.
 */
const loadBrandMeta = cache(async (brandCode: string) => {
  try {
    return await prisma.brand.findUnique({
      where: { code: brandCode },
      select: { name: true, nameTh: true, nameEn: true, siteTitle: true, siteDescription: true },
    });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { brandCode } = await params;
  const brand = await loadBrandMeta(brandCode);
  if (!brand) return {};
  const name = localizedName(brand.name, brand.nameTh, brand.nameEn);
  return {
    title: brand.siteTitle || name,
    description: brand.siteDescription ?? undefined,
  };
}

/**
 * No DB call here — brand branding is loaded client-side by OrderBrandingShell
 * (reads sessionStorage set by syncActiveBrandFromApi in the store page).
 * This avoids RSC 500 errors when the DB connection drops in production.
 */
export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrderBrandingShell>{children}</OrderBrandingShell>;
}

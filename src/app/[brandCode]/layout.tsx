import type { Metadata } from "next";
import { OrderBrandingShell } from "@/components/customer/OrderBrandingShell";
import { prisma } from "@/lib/db";
import { localizedName } from "@/lib/localized";

type Params = { params: Promise<{ brandCode: string }> };

async function loadBrand(brandCode: string) {
  try {
    return await prisma.brand.findUnique({ where: { code: brandCode } });
  } catch (error) {
    console.error(`[BrandLayout] Failed to load brand ${brandCode}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { brandCode } = await params;
  const brand = await loadBrand(brandCode);
  if (!brand) return {};
  const name = localizedName(brand.name, brand.nameTh, brand.nameEn);
  return {
    title: brand.siteTitle || name,
    description: brand.siteDescription ?? undefined,
  };
}

/** Match /order layout — no async DB work here (avoids production RSC 500). */
export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrderBrandingShell>{children}</OrderBrandingShell>;
}

import type { Metadata } from "next";
import { CustomerProvider } from "@/components/customer/CustomerProvider";
import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";
import { brandColorFromApi } from "@/lib/color";
import { prisma } from "@/lib/db";
import { localizedName } from "@/lib/localized";

type Params = { params: Promise<{ brandCode: string }> };

async function loadBrand(brandCode: string) {
  return prisma.brand.findUnique({ where: { code: brandCode } });
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

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandCode: string }>;
}) {
  const { brandCode } = await params;
  const brand = await loadBrand(brandCode);
  const brandOverride = brand
    ? {
        siteName: localizedName(brand.name, brand.nameTh, brand.nameEn),
        siteTitle: brand.siteTitle || brand.name,
        siteDescription: brand.siteDescription,
        logoUrl: brand.logoUrl,
        primaryColor: brandColorFromApi(brand.color),
      }
    : null;

  return (
    <SiteBrandingProvider brandOverride={brandOverride}>
      <CustomerProvider>
        <div className="mx-auto min-h-screen w-full max-w-md overflow-hidden bg-[#f5f5f6] shadow-xl">
          {children}
        </div>
      </CustomerProvider>
    </SiteBrandingProvider>
  );
}

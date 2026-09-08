import { cache } from "react";
import type { Metadata } from "next";
import { OrderBrandingShell } from "@/components/customer/OrderBrandingShell";
import { prisma } from "@/lib/db";
import { localizedName } from "@/lib/localized";
import { buildOrderShareMetadata } from "@/lib/order-og";
import { brandColorFromApi } from "@/lib/color";

type Params = { params: Promise<{ brandCode: string }> };

/**
 * Shared by generateMetadata + BrandLayout — cache() ensures a single DB call per request.
 */
const loadBrandMeta = cache(async (brandCode: string) => {
  try {
    return await prisma.brand.findUnique({
      where: { code: brandCode },
      select: {
        name: true,
        nameTh: true,
        nameEn: true,
        siteTitle: true,
        siteDescription: true,
        logoUrl: true,
        coverImageUrl: true,
        color: true,
        branches: {
          where: { isHidden: false, isTest: false },
          select: { imageUrl: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
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
  const title = brand.siteTitle?.trim() || `สั่งอาหารจาก ${name}`;
  const description =
    brand.siteDescription?.trim() ||
    `ดูเมนูและสั่งอาหารออนไลน์จาก ${name}`;

  try {
    return await buildOrderShareMetadata({
      title,
      description,
      path: `/${brandCode}`,
      imageAlt: name,
      imageCandidates: [
        brand.coverImageUrl,
        brand.logoUrl,
        brand.branches[0]?.imageUrl,
      ],
    });
  } catch {
    return { title, description };
  }
}

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandCode: string }>;
}) {
  const { brandCode } = await params;
  const brand = await loadBrandMeta(brandCode);
  const name = brand
    ? localizedName(brand.name, brand.nameTh, brand.nameEn)
    : null;
  const primaryColor = brand ? brandColorFromApi(brand.color) : null;
  const initialBrandOverride = brand
    ? {
        siteName: name ?? brand.name,
        siteTitle: brand.siteTitle?.trim() || name || brand.name,
        siteDescription: brand.siteDescription,
        logoUrl: brand.logoUrl,
        primaryColor,
      }
    : null;

  return (
    <>
      {primaryColor ? (
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--site-primary:${primaryColor}}`,
          }}
        />
      ) : null}
      <OrderBrandingShell initialBrandOverride={initialBrandOverride}>
        {children}
      </OrderBrandingShell>
    </>
  );
}

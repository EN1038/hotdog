import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getAppOrigin } from "@/lib/app-url";
import { localizedName } from "@/lib/localized";
import {
  getPlatformSettings,
  resolvePlatformMarkForPlacement,
} from "@/lib/platform-settings";

type Params = {
  params: Promise<{ branchId: string }>;
};

function absoluteUrl(value: string, origin: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (!origin) return value;
  return `${origin}/${value.replace(/^\/+/, "")}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { branchId } = await params;

  try {
    const [branch, platform] = await Promise.all([
      prisma.branch.findFirst({
        where: { id: branchId, isHidden: false },
        select: {
          name: true,
          nameTh: true,
          nameEn: true,
          imageUrl: true,
          address: true,
          brand: {
            select: {
              name: true,
              nameTh: true,
              nameEn: true,
              logoUrl: true,
              coverImageUrl: true,
            },
          },
        },
      }),
      getPlatformSettings(),
    ]);

    if (!branch) return {};

    const branchName = localizedName(
      branch.name,
      branch.nameTh,
      branch.nameEn,
    );
    const brandName = branch.brand
      ? localizedName(
          branch.brand.name,
          branch.brand.nameTh,
          branch.brand.nameEn,
        )
      : "";
    const displayName = brandName
      ? `${brandName} - ${branchName}`
      : branchName;
    const title = `สั่งอาหารจาก ${displayName}`;
    const description = branch.address
      ? `สั่งอาหารออนไลน์จาก ${displayName} · ${branch.address}`
      : `ดูเมนูและสั่งอาหารออนไลน์จาก ${displayName}`;
    const origin = getAppOrigin();
    const pageUrl = absoluteUrl(`/order/store/${branchId}`, origin);
    const platformImage = resolvePlatformMarkForPlacement(
      platform,
      "order",
    ).src;
    const image = absoluteUrl(
      branch.imageUrl?.trim() ||
        branch.brand?.coverImageUrl?.trim() ||
        branch.brand?.logoUrl?.trim() ||
        platformImage,
      origin,
    );

    return {
      title,
      description,
      ...(origin ? { metadataBase: new URL(origin) } : {}),
      alternates: { canonical: pageUrl },
      openGraph: {
        type: "website",
        locale: "th_TH",
        url: pageUrl,
        siteName: platform.siteName,
        title,
        description,
        images: [{ url: image, alt: displayName }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [image],
      },
    };
  } catch {
    // Keep the storefront available if metadata lookup fails.
    return {};
  }
}

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

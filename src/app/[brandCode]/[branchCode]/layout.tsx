import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { localizedName } from "@/lib/localized";
import { buildOrderShareMetadata } from "@/lib/order-og";

type Params = {
  params: Promise<{ brandCode: string; branchCode: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { brandCode, branchCode } = await params;

  try {
    const branch = await prisma.branch.findFirst({
      where: {
        code: branchCode,
        isHidden: false,
        brand: { code: brandCode },
      },
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
            siteTitle: true,
            siteDescription: true,
          },
        },
      },
    });

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
    const title =
      branch.brand?.siteTitle?.trim() || `สั่งอาหารจาก ${displayName}`;
    const description =
      branch.brand?.siteDescription?.trim() ||
      (branch.address
        ? `สั่งอาหารออนไลน์จาก ${displayName} · ${branch.address}`
        : `ดูเมนูและสั่งอาหารออนไลน์จาก ${displayName}`);

    return await buildOrderShareMetadata({
      title,
      description,
      path: `/${brandCode}/${branchCode}`,
      imageAlt: displayName,
      imageCandidates: [
        branch.imageUrl,
        branch.brand?.coverImageUrl,
        branch.brand?.logoUrl,
      ],
    });
  } catch {
    return {};
  }
}

export default function BrandBranchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

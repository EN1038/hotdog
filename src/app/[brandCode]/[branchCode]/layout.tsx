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
    const brand = await prisma.brand.findUnique({
      where: { code: brandCode },
      select: {
        id: true,
        name: true,
        nameTh: true,
        nameEn: true,
        logoUrl: true,
        coverImageUrl: true,
      },
    });
    if (!brand) return {};

    const branch = await prisma.branch.findFirst({
      where: {
        brandId: brand.id,
        isHidden: false,
        OR: [{ code: branchCode }, { id: branchCode }],
      },
      select: {
        name: true,
        nameTh: true,
        nameEn: true,
        imageUrl: true,
        address: true,
      },
    });
    if (!branch) return {};

    const brandName = localizedName(brand.name, brand.nameTh, brand.nameEn);
    const branchName = localizedName(
      branch.name,
      branch.nameTh,
      branch.nameEn,
    );
    const displayName = `${brandName} - ${branchName}`;
    const title = `สั่งอาหารจาก ${displayName}`;
    const description = branch.address
      ? `สั่งอาหารออนไลน์จาก ${displayName} · ${branch.address}`
      : `ดูเมนูและสั่งอาหารออนไลน์จาก ${displayName}`;

    return await buildOrderShareMetadata({
      title,
      description,
      path: `/${brandCode}/${branchCode}`,
      imageAlt: displayName,
      imageCandidates: [
        branch.imageUrl,
        brand.coverImageUrl,
        brand.logoUrl,
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

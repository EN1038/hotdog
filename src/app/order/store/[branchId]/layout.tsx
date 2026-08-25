import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { localizedName } from "@/lib/localized";
import { buildOrderShareMetadata } from "@/lib/order-og";

type Params = {
  params: Promise<{ branchId: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { branchId } = await params;

  try {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, isHidden: false, isTest: false },
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
    const title = `สั่งอาหารจาก ${displayName}`;
    const description = branch.address
      ? `สั่งอาหารออนไลน์จาก ${displayName} · ${branch.address}`
      : `ดูเมนูและสั่งอาหารออนไลน์จาก ${displayName}`;

    return await buildOrderShareMetadata({
      title,
      description,
      path: `/order/store/${branchId}`,
      imageAlt: displayName,
      imageCandidates: [
        branch.imageUrl,
        branch.brand?.coverImageUrl,
        branch.brand?.logoUrl,
      ],
    });
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

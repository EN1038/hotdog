import type { BrandPrintLayoutKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";
import { DEFAULT_PACKAGE_LABEL_LAYOUT } from "@/lib/print-layout/package-label-default-layout";
import {
  parsePackageLabelLayoutDoc,
  packageLabelLayoutDocSchema,
} from "@/lib/print-layout/package-label-layout-schema";
import type { PackageLabelLayoutDoc } from "@/lib/print-layout/package-label-layout-types";

export const BRAND_PACKAGE_LABEL_KIND =
  "PACKAGE_LABEL" satisfies BrandPrintLayoutKind;

export type BrandPackageLabelLayoutResponse = {
  brandId: string;
  kind: typeof BRAND_PACKAGE_LABEL_KIND;
  version: number;
  layout: PackageLabelLayoutDoc;
  updatedAt: string;
};

export async function getBrandPackageLabelLayout(
  brandId: string,
): Promise<BrandPackageLabelLayoutResponse> {
  await ensureProdSchemaCompat();
  const row = await prisma.brandPrintLayout.findUnique({
    where: {
      brandId_kind: {
        brandId,
        kind: BRAND_PACKAGE_LABEL_KIND,
      },
    },
  });

  if (!row) {
    const created = await prisma.brandPrintLayout.create({
      data: {
        brandId,
        kind: BRAND_PACKAGE_LABEL_KIND,
        version: DEFAULT_PACKAGE_LABEL_LAYOUT.version,
        layout: DEFAULT_PACKAGE_LABEL_LAYOUT as Prisma.InputJsonValue,
      },
    });
    return toResponse(brandId, created.version, created.layout, created.updatedAt);
  }

  const layout = parsePackageLabelLayoutDoc(row.layout);
  const version = row.version;
  if (layout.version !== version) {
    layout.version = version;
  }
  return toResponse(brandId, version, layout, row.updatedAt);
}

export async function updateBrandPackageLabelLayout(input: {
  brandId: string;
  layout: unknown;
  bumpVersion?: boolean;
}): Promise<BrandPackageLabelLayoutResponse> {
  const parsed = packageLabelLayoutDocSchema.parse(input.layout);
  const existing = await prisma.brandPrintLayout.findUnique({
    where: {
      brandId_kind: {
        brandId: input.brandId,
        kind: BRAND_PACKAGE_LABEL_KIND,
      },
    },
    select: { version: true },
  });

  const nextVersion = input.bumpVersion
    ? (existing?.version ?? 0) + 1
    : parsed.version;

  const layoutDoc: PackageLabelLayoutDoc = {
    ...parsed,
    version: nextVersion,
  };

  const row = await prisma.brandPrintLayout.upsert({
    where: {
      brandId_kind: {
        brandId: input.brandId,
        kind: BRAND_PACKAGE_LABEL_KIND,
      },
    },
    create: {
      brandId: input.brandId,
      kind: BRAND_PACKAGE_LABEL_KIND,
      version: nextVersion,
      layout: layoutDoc as Prisma.InputJsonValue,
    },
    update: {
      version: nextVersion,
      layout: layoutDoc as Prisma.InputJsonValue,
    },
  });

  return toResponse(input.brandId, row.version, layoutDoc, row.updatedAt);
}

function toResponse(
  brandId: string,
  version: number,
  layoutRaw: unknown,
  updatedAt: Date,
): BrandPackageLabelLayoutResponse {
  const layout = parsePackageLabelLayoutDoc(layoutRaw);
  layout.version = version;
  return {
    brandId,
    kind: BRAND_PACKAGE_LABEL_KIND,
    version,
    layout,
    updatedAt: updatedAt.toISOString(),
  };
}

import { z } from "zod";
import type { PackageLabelLayoutDoc } from "@/lib/print-layout/package-label-layout-types";
import { DEFAULT_PACKAGE_LABEL_LAYOUT } from "@/lib/print-layout/package-label-default-layout";

const textBlockSchema = z.object({
  type: z.literal("text"),
  field: z.string().min(1).optional(),
  template: z.string().min(1).optional(),
  style: z.enum(["header", "title", "row", "caption"]),
  align: z.enum(["left", "center"]).optional(),
  maxLines: z.number().int().min(1).max(4).optional(),
  uppercase: z.boolean().optional(),
  fallback: z.string().optional(),
});

const blockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  z.object({
    type: z.literal("barcode"),
    field: z.string().min(1),
    width: z.number().int().min(80).max(400).optional(),
    height: z.number().int().min(24).max(120).optional(),
    showCaption: z.boolean().optional(),
    captionField: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("qr"),
    field: z.string().min(1),
    size: z.number().int().min(64).max(240).optional(),
  }),
  z.object({
    type: z.literal("spacer"),
    height: z.number().min(0).max(40),
  }),
]);

export const packageLabelLayoutDocSchema = z.object({
  version: z.number().int().min(1).max(9999),
  widthPx: z.number().int().min(280).max(600),
  paddingH: z.number().min(0).max(40),
  blocks: z.array(blockSchema).min(1).max(40),
});

export function parsePackageLabelLayoutDoc(
  raw: unknown,
): PackageLabelLayoutDoc {
  const parsed = packageLabelLayoutDocSchema.safeParse(raw);
  if (!parsed.success) {
    return DEFAULT_PACKAGE_LABEL_LAYOUT;
  }
  for (const block of parsed.data.blocks) {
    if (block.type === "text" && !block.field && !block.template) {
      return DEFAULT_PACKAGE_LABEL_LAYOUT;
    }
  }
  return parsed.data;
}

export function layoutEtag(version: number): string {
  return `"package-label-v${version}"`;
}

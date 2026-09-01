import { renderProductBarcodeSvg } from "@/lib/product-label-print";
import {
  applyTemplate,
  fieldText,
  type PackageLabelRenderInput,
  buildPackageLabelFieldMap,
} from "@/lib/print-layout/package-label-fields";
import type {
  PackageLabelLayoutBlock,
  PackageLabelLayoutDoc,
} from "@/lib/print-layout/package-label-layout-types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLE_CSS: Record<string, string> = {
  header:
    "margin:0 0 1.5mm;font-size:7pt;font-weight:800;text-align:center;letter-spacing:0.04em;text-transform:uppercase;line-height:1.2;",
  title:
    "margin:0 0 1.5mm;font-size:8pt;font-weight:800;line-height:1.2;",
  row: "margin:0 0 0.8mm;font-size:6.5pt;line-height:1.25;",
  caption:
    "margin:0.5mm 0 0;font-size:6pt;text-align:center;",
};

export function renderPackageLabelArticleFromLayout(
  layout: PackageLabelLayoutDoc,
  label: PackageLabelRenderInput,
  qrSvg: string,
): string {
  const fields = buildPackageLabelFieldMap(label);
  const parts: string[] = [];

  for (const block of layout.blocks) {
    parts.push(renderBlock(block, fields, qrSvg));
  }

  const widthMm = Math.round((layout.widthPx / 400) * 56);

  return `
    <article class="label" style="width:${widthMm}mm;padding:1.5mm ${layout.paddingH / 4}mm 2mm;">
      ${parts.join("")}
    </article>
  `;
}

function renderBlock(
  block: PackageLabelLayoutBlock,
  fields: Record<string, string | number>,
  qrSvg: string,
): string {
  switch (block.type) {
    case "text": {
      let text = block.template
        ? applyTemplate(block.template, fields)
        : fieldText(block.field ?? "", fields, block.fallback ?? "—");
      if (block.uppercase) text = text.toUpperCase();
      const align = block.align === "center" ? "center" : "left";
      const css = STYLE_CSS[block.style] ?? STYLE_CSS.row;
      return `<p style="${css}text-align:${align};">${escapeHtml(text)}</p>`;
    }
    case "barcode": {
      const value = fieldText(block.field, fields, "0");
      const barcode = renderProductBarcodeSvg(value);
      const caption = block.showCaption
        ? `<p style="${STYLE_CSS.caption}">${escapeHtml(
            fieldText(block.captionField ?? block.field, fields, value),
          )}</p>`
        : "";
      return `<div class="barcode-wrap" style="margin-top:1.5mm;text-align:center;"><div class="barcode">${barcode}</div>${caption}</div>`;
    }
    case "qr":
      return `<div class="qr" style="margin-top:1mm;text-align:center;">${qrSvg}</div>`;
    case "spacer":
      return `<div style="height:${block.height / 4}mm;"></div>`;
    default:
      return "";
  }
}

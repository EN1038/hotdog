export const PACKAGE_LABEL_LAYOUT_KIND = "PACKAGE_LABEL" as const;

export type PackageLabelLayoutTextStyle = "header" | "title" | "row" | "caption";

export type PackageLabelLayoutBlock =
  | {
      type: "text";
      field?: string;
      template?: string;
      style: PackageLabelLayoutTextStyle;
      align?: "left" | "center";
      maxLines?: number;
      uppercase?: boolean;
      fallback?: string;
    }
  | {
      type: "barcode";
      field: string;
      width?: number;
      height?: number;
      showCaption?: boolean;
      captionField?: string;
    }
  | {
      type: "qr";
      field: string;
      size?: number;
    }
  | {
      type: "spacer";
      height: number;
    };

export type PackageLabelLayoutDoc = {
  version: number;
  widthPx: number;
  paddingH: number;
  blocks: PackageLabelLayoutBlock[];
};

export type PackageLabelFieldMap = Record<string, string | number>;

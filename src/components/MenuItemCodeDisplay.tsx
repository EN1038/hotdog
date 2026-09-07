import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

export type MenuItemCodeSource = {
  id: string;
  itemCode?: string | null;
};

const codeBadgeClass =
  "rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-gray-800";

/**
 * Product-code badge for lists is hidden by default so names stay readable.
 * Pass `show` for edit forms / print / scan contexts that still need the code.
 */
export function MenuItemCodeBadge({
  code,
  className = "",
  show = false,
}: {
  code: string;
  className?: string;
  show?: boolean;
}) {
  if (!show) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  return (
    <code className={`${codeBadgeClass} ${className}`.trim()}>{trimmed}</code>
  );
}

export function resolveDisplayProductCode(
  source?: MenuItemCodeSource | string | null,
): string {
  if (!source) return "";
  if (typeof source === "string") return source.trim();
  return resolveMenuItemProductCode(source);
}

type MenuItemNameWithCodeProps = {
  name: string;
  productCode?: string | null;
  menuItem?: MenuItemCodeSource;
  layout?: "inline" | "stacked";
  nameClassName?: string;
  codeClassName?: string;
  className?: string;
  /** When true, show product code badge next to the name (default: hidden). */
  showCode?: boolean;
};

/** Product name with optional code badge — code hidden by default. */
export function MenuItemNameWithCode({
  name,
  productCode,
  menuItem,
  layout = "inline",
  nameClassName = "",
  codeClassName = "",
  className = "",
  showCode = false,
}: MenuItemNameWithCodeProps) {
  const code =
    productCode?.trim() ||
    (menuItem ? resolveMenuItemProductCode(menuItem) : "");

  if (!showCode || !code) {
    return (
      <span className={`min-w-0 ${nameClassName} ${className}`.trim()}>
        {name}
      </span>
    );
  }

  if (layout === "stacked") {
    return (
      <div className={`min-w-0 ${className}`.trim()}>
        <MenuItemCodeBadge
          show
          code={code}
          className={`mb-0.5 ${codeClassName}`.trim()}
        />
        <span className={nameClassName}>{name}</span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex min-w-0 flex-wrap items-center gap-1.5 ${className}`.trim()}
    >
      <MenuItemCodeBadge show code={code} className={codeClassName} />
      <span className={`min-w-0 ${nameClassName}`.trim()}>{name}</span>
    </span>
  );
}

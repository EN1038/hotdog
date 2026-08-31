import { resolveMenuItemProductCode } from "@/lib/inventory/inventory-menu-code";

export type MenuItemCodeSource = {
  id: string;
  itemCode?: string | null;
  brandProduct?: { sku?: string | null; barcode?: string | null } | null;
};

const codeBadgeClass =
  "rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-gray-800";

export function MenuItemCodeBadge({
  code,
  className = "",
}: {
  code: string;
  className?: string;
}) {
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
};

/** Product name with optional code badge — inline (default) or stacked for narrow cards. */
export function MenuItemNameWithCode({
  name,
  productCode,
  menuItem,
  layout = "inline",
  nameClassName = "",
  codeClassName = "",
  className = "",
}: MenuItemNameWithCodeProps) {
  const code =
    productCode?.trim() ||
    (menuItem ? resolveMenuItemProductCode(menuItem) : "");

  if (!code) {
    return <span className={`min-w-0 ${nameClassName} ${className}`.trim()}>{name}</span>;
  }

  if (layout === "stacked") {
    return (
      <div className={`min-w-0 ${className}`.trim()}>
        <MenuItemCodeBadge code={code} className={`mb-0.5 ${codeClassName}`.trim()} />
        <span className={nameClassName}>{name}</span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex min-w-0 flex-wrap items-center gap-1.5 ${className}`.trim()}
    >
      <MenuItemCodeBadge code={code} className={codeClassName} />
      <span className={`min-w-0 ${nameClassName}`.trim()}>{name}</span>
    </span>
  );
}

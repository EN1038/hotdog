import { resolveOwnerView } from "@/lib/owner-view-preference";

/** Owner mobile shell (/owner/...) unless user explicitly chose desktop admin. */
export function shouldUseOwnerBranchShell(): boolean {
  return resolveOwnerView() !== "desktop";
}

export function branchAdminBasePath(
  branchId: string,
  opts?: { ownerShell?: boolean; forceAdmin?: boolean },
): string {
  if (opts?.forceAdmin) return `/admin/branches/${branchId}`;
  if (opts?.ownerShell || shouldUseOwnerBranchShell()) {
    return `/owner/branches/${branchId}`;
  }
  return `/admin/branches/${branchId}`;
}

export function branchMenuEditorPath(
  branchId: string,
  itemId: string,
  opts?: { ownerShell?: boolean; forceAdmin?: boolean },
): string {
  return `${branchAdminBasePath(branchId, opts)}/menu/${itemId}`;
}

export function parseBranchAdminId(pathname: string): string | null {
  const m = pathname.match(/^\/(?:owner|admin)\/branches\/([^/]+)/);
  return m?.[1] ?? null;
}

export function isOwnerBranchAdminPath(pathname: string): boolean {
  return /^\/owner\/branches\/[^/]+/.test(pathname);
}

export function isAdminBranchAdminPath(pathname: string): boolean {
  return /^\/admin\/branches\/[^/]+/.test(pathname);
}

export function counterpartBranchAdminPath(
  pathname: string,
  search = "",
): string | null {
  const suffix = search
    ? search.startsWith("?")
      ? search
      : `?${search}`
    : "";
  const ownerMatch = pathname.match(/^\/owner\/branches\/([^/]+)(.*)$/);
  if (ownerMatch) {
    return `/admin/branches/${ownerMatch[1]}${ownerMatch[2] || ""}${suffix}`;
  }
  const adminMatch = pathname.match(/^\/admin\/branches\/([^/]+)(.*)$/);
  if (adminMatch) {
    return `/owner/branches/${adminMatch[1]}${adminMatch[2] || ""}${suffix}`;
  }
  return null;
}

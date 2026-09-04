import type { BranchData } from "@/lib/customer-types";
import {
  distanceKm,
  formatDistanceKm,
  hasMapPin,
} from "@/lib/geo";
import { getBranchServiceStatus } from "@/lib/branch-hours";
import { localizedName } from "@/lib/localized";

export type UserLocation = { lat: number; lng: number };

export type DirectoryBrandGroup = {
  brandCode: string;
  brandName: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  color: string | null;
  contactPhone: string | null;
  branches: BranchData[];
};

export function branchDistanceKm(
  branch: BranchData,
  user: UserLocation | null,
): number | null {
  if (!user || !hasMapPin(branch)) return null;
  return distanceKm(user.lat, user.lng, branch.latitude, branch.longitude);
}

export function formatBranchDistance(
  branch: BranchData,
  user: UserLocation | null,
): string | null {
  const km = branchDistanceKm(branch, user);
  return km != null ? formatDistanceKm(km) : null;
}

export function sortBranches(
  branches: BranchData[],
  user: UserLocation | null,
): BranchData[] {
  return [...branches].sort((a, b) => {
    if (user) {
      const da = branchDistanceKm(a, user);
      const db = branchDistanceKm(b, user);
      if (da != null && db != null && da !== db) return da - db;
      if (da != null && db == null) return -1;
      if (da == null && db != null) return 1;
    }
    const aOpen = getBranchServiceStatus(a, "PICKUP").openNow;
    const bOpen = getBranchServiceStatus(b, "PICKUP").openNow;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return a.name.localeCompare(b.name, "th");
  });
}

export function matchesDirectoryQuery(branch: BranchData, q: string): boolean {
  if (!q) return true;
  const brand = branch.brand;
  const hay = [
    branch.name,
    branch.nameTh,
    branch.nameEn,
    branch.code,
    branch.address,
    brand?.name,
    brand?.nameTh,
    brand?.nameEn,
    brand?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function groupBranchesByBrand(
  branches: BranchData[],
  user: UserLocation | null,
): DirectoryBrandGroup[] {
  const map = new Map<string, DirectoryBrandGroup>();

  for (const branch of branches) {
    const brand = branch.brand;
    if (!brand?.code) continue;
    const existing = map.get(brand.code);
    if (existing) {
      existing.branches.push(branch);
      continue;
    }
    map.set(brand.code, {
      brandCode: brand.code,
      brandName: localizedName(brand.name, brand.nameTh, brand.nameEn),
      logoUrl: brand.logoUrl?.trim() || null,
      coverImageUrl: brand.coverImageUrl?.trim() || null,
      color: brand.color?.trim() || null,
      contactPhone: brand.contactPhone?.replace(/\D/g, "") || null,
      branches: [branch],
    });
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.branches = sortBranches(g.branches, user);
  }

  groups.sort((a, b) => {
    if (user) {
      const da = branchDistanceKm(a.branches[0]!, user);
      const db = branchDistanceKm(b.branches[0]!, user);
      if (da != null && db != null && da !== db) return da - db;
      if (da != null && db == null) return -1;
      if (da == null && db != null) return 1;
    }
    return a.brandName.localeCompare(b.brandName, "th");
  });

  return groups;
}

export function branchDeepLink(branch: BranchData): string {
  const brandCode = branch.brand?.code?.trim();
  const branchCode = branch.code?.trim();
  if (brandCode && branchCode) {
    return `/${brandCode}/${branchCode}`;
  }
  if (branch.operatingMode === "SKEWER") {
    return `/skewer/${branch.id}`;
  }
  return `/order/store/${branch.id}`;
}

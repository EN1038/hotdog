/** จำธีมแบรนด์ของพนักงานหลังเข้าสู่ระบบ (สี / โลโก้ ใน /staff) */
const STORAGE_KEY = "skillsale_staff_brand";

export type StaffBrandSession = {
  code: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
};

export function saveStaffBrand(brand: StaffBrandSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
  } catch {
    /* ignore */
  }
}

export function clearStaffBrand() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadStaffBrand(): StaffBrandSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffBrandSession>;
    if (
      typeof parsed.code !== "string" ||
      !parsed.code.trim() ||
      typeof parsed.name !== "string" ||
      typeof parsed.primaryColor !== "string"
    ) {
      return null;
    }
    return {
      code: parsed.code.trim(),
      name: parsed.name,
      logoUrl:
        typeof parsed.logoUrl === "string" && parsed.logoUrl.trim()
          ? parsed.logoUrl.trim()
          : null,
      primaryColor: parsed.primaryColor,
    };
  } catch {
    return null;
  }
}

export function staffBrandFromApi(brand: {
  code?: string | null;
  name?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
  logoUrl?: string | null;
  color?: string | null;
} | null | undefined): StaffBrandSession | null {
  if (!brand?.code?.trim() || !brand.name) return null;
  return {
    code: brand.code.trim(),
    name: brand.nameTh?.trim() || brand.nameEn?.trim() || brand.name,
    logoUrl: brand.logoUrl?.trim() || null,
    primaryColor: brand.color?.trim() || "#dc2626",
  };
}

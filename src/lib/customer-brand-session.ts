/** จำแบรนด์ที่ลูกค้าเข้ามา (สำหรับธีมสี / โลโก้ / รูปปก ใน /order) */
const STORAGE_KEY = "skillsale_active_brand";

export type ActiveBrandSession = {
  code: string;
  name: string;
  logoUrl: string | null;
  /** รูปปกแบรนด์ — ใช้หัวภาพ login เมื่อยังไม่รู้สาขา */
  coverImageUrl: string | null;
  primaryColor: string;
  contactPhone: string | null;
};

export function saveActiveBrand(brand: ActiveBrandSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
  } catch {
    /* ignore */
  }
}

export function loadActiveBrand(): ActiveBrandSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveBrandSession>;
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
      coverImageUrl:
        typeof parsed.coverImageUrl === "string" && parsed.coverImageUrl.trim()
          ? parsed.coverImageUrl.trim()
          : null,
      primaryColor: parsed.primaryColor,
      contactPhone:
        typeof parsed.contactPhone === "string" && parsed.contactPhone.trim()
          ? parsed.contactPhone.replace(/\D/g, "")
          : null,
    };
  } catch {
    return null;
  }
}

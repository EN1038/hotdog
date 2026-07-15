/** ข้อมูลโปรไฟล์แบรนด์ที่ควรมีก่อนเปิดใช้จริง */
export function getBrandProfileGaps(brand: {
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  contactPhone?: string | null;
}): string[] {
  const missing: string[] = [];
  if (!brand.logoUrl?.trim()) missing.push("โลโก้");
  if (!brand.coverImageUrl?.trim()) missing.push("รูปปกแบรนด์");
  if (!brand.contactPhone?.trim()) missing.push("เบอร์ติดต่อ");
  return missing;
}

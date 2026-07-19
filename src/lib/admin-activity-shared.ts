export const ADMIN_ACTIVITY_ACTIONS = {
  "brand.create": "สร้างแบรนด์",
  "brand.update": "แก้ไขแบรนด์",
  "brand.delete": "ลบแบรนด์",
  "brand.admin.create": "สร้างผู้ดูแลแบรนด์",
  "brand.admin.link": "ผูกผู้ดูแลกับแบรนด์",
  "brand.admin.update": "แก้ไขผู้ดูแลแบรนด์",
  "brand.admin.remove": "ถอดผู้ดูแลออกจากแบรนด์",
  "branch.create": "สร้างสาขา",
  "branch.update": "แก้ไขสาขา",
  "branch.delete": "ลบสาขา",
  "staff.create": "เพิ่มพนักงาน",
  "staff.update": "แก้ไขพนักงาน",
  "staff.delete": "ลบพนักงาน",
  "menu.create": "เพิ่มเมนู",
  "menu.update": "แก้ไขเมนู",
  "menu.delete": "ลบเมนู",
  "category.create": "เพิ่มหมวดหมู่",
  "category.update": "แก้ไขหมวดหมู่",
  "category.delete": "ลบหมวดหมู่",
  "option.create": "เพิ่มตัวเลือก",
  "option.update": "แก้ไขตัวเลือก",
  "option.delete": "ลบตัวเลือก",
  "location.create": "เพิ่มพื้นที่ส่ง",
  "location.update": "แก้ไขพื้นที่ส่ง",
  "location.delete": "ลบพื้นที่ส่ง",
  "share.create": "สร้างรหัสแชร์",
  "share.import": "นำเข้าจากรหัสแชร์",
  "site.update": "แก้ตั้งค่าแพลตฟอร์ม",
  "line.update": "แก้ตั้งค่า LINE",
  "restaurant_type.create": "เพิ่มประเภทร้าน",
  "restaurant_type.update": "แก้ไขประเภทร้าน",
  "restaurant_type.delete": "ลบประเภทร้าน",
} as const;

export type AdminActivityAction = keyof typeof ADMIN_ACTIVITY_ACTIONS;

export const ADMIN_ACTIVITY_ACTION_OPTIONS = (
  Object.keys(ADMIN_ACTIVITY_ACTIONS) as AdminActivityAction[]
).map((value) => ({
  value,
  label: ADMIN_ACTIVITY_ACTIONS[value],
}));

export function activityActionLabel(action: string): string {
  if (action in ADMIN_ACTIVITY_ACTIONS) {
    return ADMIN_ACTIVITY_ACTIONS[action as AdminActivityAction];
  }
  return action;
}

export function summarizeBranchPatch(
  body: Record<string, unknown>,
  branchName: string,
): string {
  const parts: string[] = [];
  if (typeof body.isOpen === "boolean") {
    parts.push(body.isOpen ? "เปิดร้าน" : "ปิดร้าน");
  }
  if (typeof body.isHidden === "boolean") {
    parts.push(body.isHidden ? "ซ่อนสาขา" : "แสดงสาขา");
  }
  if (typeof body.allowAdvanceOrder === "boolean") {
    parts.push(
      body.allowAdvanceOrder ? "เปิดรับสั่งล่วงหน้า" : "ปิดรับสั่งล่วงหน้า",
    );
  }
  if (typeof body.autoAcceptOrders === "boolean") {
    parts.push(
      body.autoAcceptOrders ? "เปิดรับออเดอร์อัตโนมัติ" : "ปิดรับออเดอร์อัตโนมัติ",
    );
  }
  if (body.storefrontHours !== undefined) parts.push("แก้เวลาหน้าร้าน");
  if (body.deliveryHours !== undefined) parts.push("แก้เวลาเดลิเวอรี");
  if (body.name !== undefined) parts.push("แก้ชื่อ");
  if (body.phone !== undefined) parts.push("แก้เบอร์");
  if (body.address !== undefined || body.latitude !== undefined) {
    parts.push("แก้ที่ตั้ง");
  }
  if (
    body.primaryCategory !== undefined ||
    body.secondaryCategories !== undefined
  ) {
    parts.push("แก้ประเภทร้าน");
  }
  if (body.imageUrl !== undefined) parts.push("แก้รูป");
  if (parts.length === 0) parts.push("อัปเดตตั้งค่า");
  return `${parts.join(" · ")} — ${branchName}`;
}

export const ADMIN_ACTIVITY_ACTIONS = {
  "brand.create": "สร้างแบรนด์",
  "brand.update": "แก้ไขแบรนด์",
  "brand.delete": "ลบแบรนด์",
  "brand.stock.enable": "เปิดสต๊อกแบรนด์",
  "brand.stock.disable": "ปิดสต๊อกแบรนด์",
  "brand.stock.settings": "ตั้งค่าสต๊อกแบรนด์",
  "brand.product.create": "เพิ่มสินค้าสต๊อก",
  "brand.product.update": "แก้ไขสินค้าสต๊อก",
  "brand.product.delete": "ลบสินค้าสต๊อก",
  "brand.stock.receive": "รับเข้าบ้านกลาง",
  "brand.stock.stock_in": "รับเข้าสต๊อก",
  "brand.stock.transfer": "โอนสต๊อกไปสาขา",
  "brand.stock.adjust": "ปรับยอดสต๊อก",
  "brand.stock.damage": "บันทึกสินค้าเสีย",
  "brand.stock.lost": "บันทึกสินค้าสูญหาย",
  "brand.stock.issue": "เบิกของสิ้นเปลือง",
  "brand.stock.count.create": "สร้างรอบตรวจนับ",
  "brand.stock.count.complete": "ปิดรอบตรวจนับ",
  "brand.supplier.create": "เพิ่มผู้ขาย",
  "brand.po.create": "สร้างใบสั่งซื้อ",
  "brand.po.receive": "รับของจากใบสั่งซื้อ",
  "brand.stock.branch_transfer": "โอนสต๊อกระหว่างสาขา",
  "brand.stock.copy_from_branch": "คัดลอกเมนูจากสาขาเข้าบ้านกลาง",
  "brand.stock.copy_to_branch": "คัดลอกเมนูจากบ้านกลางไปสาขา",
  "brand.kitchen.produce": "ผลิต/เสียบไม้ที่ครัว",
  "brand.kitchen.request": "คำขอสต๊อกจากสาขา",
  "brand.kitchen.fulfill": "จัดส่งตามคำขอสาขา",
  "brand.admin.create": "สร้างผู้ดูแลแบรนด์",
  "brand.admin.link": "ผูกผู้ดูแลกับแบรนด์",
  "brand.admin.update": "แก้ไขผู้ดูแลแบรนด์",
  "brand.admin.remove": "ถอดผู้ดูแลออกจากแบรนด์",
  "branch.create": "สร้างสาขา",
  "branch.update": "แก้ไขสาขา",
  "branch.delete": "ลบสาขา",
  "branch.stock.enable": "เปิดสต๊อกสาขา",
  "branch.stock.disable": "ปิดสต๊อกสาขา",
  "branch.shift.cancel": "ยกเลิกรอบขาย",
  "branch.shift.restore": "กู้คืนรอบขายที่ยกเลิก",
  "bbq.table.create": "เพิ่มโต๊ะหมูกระทะ",
  "bbq.table.update": "แก้ไขโต๊ะหมูกระทะ",
  "bbq.table.delete": "ลบโต๊ะหมูกระทะ",
  "bbq.session.open": "เปิดบิลโต๊ะ",
  "bbq.session.add_line": "เพิ่มรายการบิลโต๊ะ",
  "bbq.session.close": "ปิดบิลโต๊ะ",
  "branch.stock.history.cancel": "ยกเลิกรายการเคลื่อนไหวสต๊อก",
  "branch.stock.history.restore": "กู้คืนรายการเคลื่อนไหวสต๊อก",
  "order.delete": "ลบออเดอร์ถาวร",
  "order.items_edit": "แก้ไขรายการออเดอร์",
  "line.order_delete.request": "ขออนุมัติลบออเดอร์ผ่าน LINE",
  "line.order_edit.save": "บันทึกแก้ไขออเดอร์ผ่าน LINE",
  "staff.create": "เพิ่มพนักงาน",
  "staff.update": "แก้ไขพนักงาน",
  "staff.delete": "ลบพนักงาน",
  "staff.revoke_sessions": "ปลดเครื่องเข้าใช้งานพนักงาน",
  "menu.create": "เพิ่มเมนู",
  "menu.update": "แก้ไขเมนู",
  "menu.delete": "ลบเมนู",
  "menu.reorder": "จัดลำดับเมนู",
  "category.create": "เพิ่มหมวดหมู่",
  "category.update": "แก้ไขหมวดหมู่",
  "category.delete": "ลบหมวดหมู่",
  "category.reorder": "จัดลำดับหมวดหมู่",
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
  "line.link_code.create": "สร้างรหัสเชื่อม LINE",
  "line.link": "เชื่อม LINE สำเร็จ",
  "line.unlink": "ยกเลิกเชื่อม LINE",
  "line.notify.enable": "เปิดแจ้งเตือน LINE",
  "line.notify.disable": "ปิดแจ้งเตือน LINE",
  "line.delete_mode.enter": "เข้าโหมดลบผ่าน LINE",
  "line.delete_mode.exit": "ออกโหมดลบผ่าน LINE",
  "line.edit_mode.enter": "เข้าโหมดแก้ไขผ่าน LINE",
  "line.edit_mode.exit": "ออกโหมดแก้ไขผ่าน LINE",
  "line.info": "ดูข้อมูลผ่าน LINE",
  "line.help": "เปิดช่วยเหลือผ่าน LINE",
  "restaurant_type.create": "เพิ่มประเภทร้าน",
  "restaurant_type.update": "แก้ไขประเภทร้าน",
  "restaurant_type.delete": "ลบประเภทร้าน",
  "alert_sound.create": "เพิ่มเสียงแจ้งเตือน",
  "alert_sound.update": "แก้ไขเสียงแจ้งเตือน",
  "alert_sound.delete": "ลบเสียงแจ้งเตือน",
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
  if (typeof body.isTest === "boolean") {
    parts.push(body.isTest ? "ตั้งเป็นสาขาทดลอง" : "ยกเลิกสาขาทดลอง");
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
  if (body.operatingMode === "SKEWER") {
    parts.push("ตั้งโหมดเสียบไม้");
  } else if (body.operatingMode === "NORMAL") {
    parts.push("ตั้งโหมดหมาล่าปกติ");
  } else if (body.operatingMode === "BBQ_WEIGH") {
    parts.push("ตั้งโหมดหมูกระทะชั่งกิโล");
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

"use client";

import { createContext, useContext, type ReactNode } from "react";

/** ส่วนของแท็บตั้งค่าเมื่อฝังใน modal เจ้าของร้าน */
export type OwnerBranchSettingsSection = "hours" | "branch";

export type OwnerMenuEditorDone = {
  saved?: boolean;
  /** หลังปิดฟอร์ม เปลี่ยนแท็บใน modal (เช่น ไปหมวดหมู่/ตัวเลือก) */
  nextTab?: string;
};

export type OwnerBranchEmbedValue = {
  branchId: string;
  /** แท็บที่ควบคุมจาก modal (ไม่ใช้ URL) */
  tab: string;
  setTab: (tab: string) => void;
  /** แยก settings: เวลาเปิดปิด vs โปรไฟล์สาขา */
  settingsSection?: OwnerBranchSettingsSection | null;
  /** modal มี header เอง — ซ่อน chrome ของหน้าสาขา */
  hideOuterChrome?: boolean;
  /**
   * เมื่อมีค่า = กำลังแก้/สร้างเมนูใน overlay ของ modal
   * หน้า editor อ่าน itemId จากตรงนี้แทน useParams
   */
  menuEditorItemId?: string | null;
  openMenuEditor?: (itemId: string) => void;
  closeMenuEditor?: (result?: OwnerMenuEditorDone) => void;
  /** เพิ่มเมื่อบันทึกเมนูแล้ว — ให้หน้ารายการ reload */
  menuReloadToken?: number;
};

const OwnerBranchEmbedContext = createContext<OwnerBranchEmbedValue | null>(
  null,
);

export function OwnerBranchEmbedProvider({
  value,
  children,
}: {
  value: OwnerBranchEmbedValue;
  children: ReactNode;
}) {
  return (
    <OwnerBranchEmbedContext.Provider value={value}>
      {children}
    </OwnerBranchEmbedContext.Provider>
  );
}

export function useOwnerBranchEmbed() {
  return useContext(OwnerBranchEmbedContext);
}

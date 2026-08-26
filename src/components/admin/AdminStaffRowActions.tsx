"use client";

import {
  btnDanger,
  btnOutline,
} from "@/components/admin/AdminShell";
import { PhoneCallButton } from "@/components/PhoneCallButton";

type Props = {
  phone: string;
  hasLine: boolean;
  isActive: boolean;
  compact?: boolean;
  onEdit: () => void;
  onUnlinkLine: () => void;
  onRevokeSessions: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
};

export function AdminStaffRowActions({
  phone,
  hasLine,
  isActive,
  compact = false,
  onEdit,
  onUnlinkLine,
  onRevokeSessions,
  onToggleActive,
  onDelete,
}: Props) {
  return (
    <>
      <div className={`flex w-full flex-wrap gap-2 ${compact ? "" : "sm:hidden"}`}>
        <PhoneCallButton phone={phone} className="min-h-10 flex-1" />
        <button type="button" onClick={onEdit} className={`min-h-10 flex-1 ${btnOutline}`}>
          แก้ไข
        </button>
        <details className="relative w-full">
          <summary className={`list-none [&::-webkit-details-marker]:hidden ${btnOutline} min-h-10 cursor-pointer text-center`}>
            จัดการเพิ่มเติม
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            {hasLine ? (
              <button type="button" onClick={onUnlinkLine} className={btnOutline}>
                ยกเลิก LINE
              </button>
            ) : null}
            <button type="button" onClick={onRevokeSessions} className={btnOutline}>
              ปลดเครื่อง
            </button>
            <button type="button" onClick={onToggleActive} className={btnOutline}>
              {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            </button>
            <button type="button" onClick={onDelete} className={btnDanger}>
              ลบ
            </button>
          </div>
        </details>
      </div>

      <div className={`flex flex-wrap gap-2 ${compact ? "hidden" : "hidden sm:flex"}`}>
        <PhoneCallButton phone={phone} />
        {hasLine ? (
          <button type="button" onClick={onUnlinkLine} className={btnOutline}>
            ยกเลิก LINE
          </button>
        ) : null}
        <button type="button" onClick={onEdit} className={btnOutline}>
          แก้ไข
        </button>
        <button type="button" onClick={onRevokeSessions} className={btnOutline}>
          ปลดเครื่อง
        </button>
        <button type="button" onClick={onToggleActive} className={btnOutline}>
          {isActive ? "ปิด" : "เปิด"}
        </button>
        <button type="button" onClick={onDelete} className={btnDanger}>
          ลบ
        </button>
      </div>
    </>
  );
}

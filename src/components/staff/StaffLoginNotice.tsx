"use client";

import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";
import { formatThaiPhone } from "@/lib/constants";
import { STAFF_MAX_DEVICES } from "@/lib/staff-session-limits";

export type StaffLoginNoticeKind = "unregistered" | "deviceLimit";

type StaffLoginNoticeProps = {
  kind: StaffLoginNoticeKind;
  phone: string;
  onClose: () => void;
};

export function StaffLoginNotice({
  kind,
  phone,
  onClose,
}: StaffLoginNoticeProps) {
  const prettyPhone = formatThaiPhone(phone);
  const copy =
    kind === "unregistered"
      ? {
          title: "เบอร์นี้ยังไม่ได้ลงทะเบียน",
          body: `ยังไม่พบ ${prettyPhone} ในระบบร้าน หากเป็นพนักงาน ให้เจ้าของร้านเพิ่มเบอร์ให้ก่อน แล้วค่อยเข้าใหม่`,
          hint: "ต้องการให้ทีมงานช่วยตรวจสอบ แอดไลน์ SkillSale ได้เลย",
        }
      : {
          title: `เข้าใช้งานครบ ${STAFF_MAX_DEVICES} เครื่องแล้ว`,
          body: `เบอร์ ${prettyPhone} เข้าสู่ระบบได้พร้อมกันสูงสุด ${STAFF_MAX_DEVICES} เครื่อง เพื่อความปลอดภัยของร้าน`,
          hint: "ออกจากระบบบนเครื่องที่ไม่ได้ใช้ แล้วลองใหม่ที่นี่ หรือให้เจ้าของร้าน/ทีมงานช่วยปลดเครื่องเก่า",
        };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="staff-login-notice-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="px-6 pb-2 pt-6">
          <p className="text-3xl" aria-hidden>
            {kind === "unregistered" ? "📱" : "🔒"}
          </p>
          <h2
            id="staff-login-notice-title"
            className="mt-3 text-xl font-extrabold leading-snug text-slate-900"
          >
            {copy.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
            {copy.body}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
            {copy.hint}
          </p>
        </div>
        <div className="space-y-2 px-6 pb-6 pt-4">
          <a
            href={PLATFORM_LINE_ADD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] px-4 text-[15px] font-extrabold text-white shadow-sm active:brightness-95"
          >
            แอดไลน์ติดต่อทีมงาน
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-100 px-4 text-[15px] font-bold text-slate-700"
          >
            {kind === "unregistered" ? "ลองเบอร์อื่น" : "ปิด"}
          </button>
        </div>
      </div>
    </div>
  );
}

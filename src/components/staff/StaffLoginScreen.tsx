"use client";

import Link from "next/link";
import { useState } from "react";
import { PhoneInput } from "@/components/PhoneInput";
import { PlatformMark } from "@/components/PlatformMark";
import { syncStaffBrandFromLogin } from "@/components/staff/StaffBrandingShell";
import {
  merchantButtonClass,
  merchantInputClass,
  merchantLabelClass,
} from "@/components/merchant-login-ui";

export function StaffLoginScreen() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login?type=staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const text = await res.text();
      let data: { error?: string; brand?: Parameters<typeof syncStaffBrandFromLogin>[0] } =
        {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          setError("ระบบล็อกอินขัดข้องชั่วคราว — ลองใหม่ในอีกสักครู่");
        } else {
          setError("เข้าไม่ได้ — ลองใหม่");
        }
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "ไม่พบเบอร์นี้ในระบบ — ถามเจ้าของร้าน");
        return;
      }
      syncStaffBrandFromLogin(data.brand);
      window.location.assign("/staff");
    } catch {
      setError("เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#f4f5f7]">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-2 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="flex h-12 w-12 items-center justify-center rounded-xl text-gray-700"
          aria-label="กลับ"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="flex-1 pr-12 text-center text-base font-bold text-gray-900">
          เข้าใช้งาน SkillSale
        </h1>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 px-5 py-8">
        <PlatformMark placement="login" height={36} priority />
        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <div>
            <label htmlFor="staff-phone" className={merchantLabelClass}>
              เบอร์โทรสำหรับเข้าใช้งาน
            </label>
            <PhoneInput
              id="staff-phone"
              value={phone}
              onChange={setPhone}
              className={merchantInputClass}
              required
            />
          </div>

          <div className="flex gap-2 rounded-2xl bg-sky-50 px-4 py-4 text-sm leading-relaxed text-sky-950">
            <span className="mt-0.5 text-lg" aria-hidden>
              💡
            </span>
            <div className="space-y-1">
              <p>ขอเบอร์ที่ลงทะเบียนได้ที่เจ้าของร้าน</p>
              <p>
                เจ้าของร้านเข้าจากปุ่ม{" "}
                <span className="font-semibold">เจ้าของร้าน</span> ไม่ใช่หน้านี้
              </p>
            </div>
          </div>

          {error ? (
            <p className="text-base text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className={merchantButtonClass}
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "ถัดไป"}
          </button>
        </form>
      </div>
    </main>
  );
}

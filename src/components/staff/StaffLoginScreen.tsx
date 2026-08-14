"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneInput } from "@/components/PhoneInput";
import { PlatformMark } from "@/components/PlatformMark";
import { syncStaffBrandFromLogin } from "@/components/staff/StaffBrandingShell";
import {
  merchantButtonClass,
  merchantInputClass,
  merchantLabelClass,
} from "@/components/merchant-login-ui";
import { formatThaiPhone } from "@/lib/constants";
import { getStaffDeviceId } from "@/lib/staff-device";
import {
  STAFF_LOGIN_DEVICE_LIMIT,
  STAFF_LOGIN_UNREGISTERED,
} from "@/lib/staff-session-limits";
import { StaffLoginNotice } from "@/components/staff/StaffLoginNotice";
import type { StaffLoginNoticeKind } from "@/components/staff/StaffLoginNotice";

type BranchChoice = {
  staffId: string;
  branchId: string;
  branchName: string;
  brandName: string | null;
  roles: string[];
};

type StaffLoginResponse = {
  error?: string;
  reason?: string;
  needsOtp?: boolean;
  needsBranchSelect?: boolean;
  branches?: BranchChoice[];
  brand?: Parameters<typeof syncStaffBrandFromLogin>[0];
};

export function StaffLoginScreen() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<BranchChoice[] | null>(null);
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpRefNo, setOtpRefNo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [notice, setNotice] = useState<StaffLoginNoticeKind | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  function resetOtp() {
    setOtpStep(false);
    setOtpCode("");
    setChallengeId(null);
    setOtpRefNo(null);
    setResendIn(0);
  }

  async function sendStaffOtp() {
    const res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose: "staff" }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      reason?: string;
      challengeId?: string;
      otpRefNo?: string | null;
      resendIn?: number;
    };
    if (!res.ok) {
      if (data.reason === STAFF_LOGIN_UNREGISTERED) {
        setNotice("unregistered");
        return null;
      }
      return data.error ?? "ส่งรหัส OTP ไม่สำเร็จ";
    }
    if (!data.challengeId) {
      return "ส่งรหัส OTP ไม่สำเร็จ";
    }
    setChallengeId(data.challengeId);
    setOtpRefNo(data.otpRefNo ?? null);
    setOtpCode("");
    setOtpStep(true);
    setResendIn(
      typeof data.resendIn === "number" && data.resendIn > 0
        ? data.resendIn
        : 60,
    );
    return null;
  }

  async function completeLogin(opts?: {
    selectedBranchId?: string;
    otp?: { challengeId: string; otpCode: string };
  }) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login?type=staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          deviceId: getStaffDeviceId(),
          ...(opts?.selectedBranchId
            ? { branchId: opts.selectedBranchId }
            : {}),
          ...(opts?.otp
            ? {
                challengeId: opts.otp.challengeId,
                otpCode: opts.otp.otpCode,
              }
            : {}),
        }),
      });
      const text = await res.text();
      let data: StaffLoginResponse = {};
      try {
        data = text ? (JSON.parse(text) as StaffLoginResponse) : {};
      } catch {
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          setError("ระบบล็อกอินขัดข้องชั่วคราว — ลองใหม่ในอีกสักครู่");
        } else {
          setError("เข้าไม่ได้ — ลองใหม่");
        }
        return;
      }
      if (!res.ok) {
        if (data.reason === STAFF_LOGIN_UNREGISTERED) {
          setNotice("unregistered");
          return;
        }
        if (data.reason === STAFF_LOGIN_DEVICE_LIMIT) {
          setNotice("deviceLimit");
          return;
        }
        setError(data.error ?? "เข้าไม่ได้ — ลองใหม่");
        return;
      }
      if (data.needsOtp) {
        const sendErr = await sendStaffOtp();
        if (sendErr) setError(sendErr);
        return;
      }
      if (data.needsBranchSelect && data.branches?.length) {
        resetOtp();
        setBranches(data.branches);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otpStep) {
      if (!challengeId) {
        setError("กรุณาขอรหัส OTP ใหม่");
        return;
      }
      if (!otpCode.trim()) {
        setError("กรุณากรอกรหัส OTP");
        return;
      }
      await completeLogin({
        otp: { challengeId, otpCode: otpCode.trim() },
      });
      return;
    }
    setBranches(null);
    resetOtp();
    await completeLogin();
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

        {branches ? (
          <div className="mt-10 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">เลือกสาขา</h2>
              <p className="mt-1 text-sm text-gray-600">
                เบอร์นี้ทำงานได้หลายสาขา — เลือกสาขาที่ต้องการเข้าวันนี้
              </p>
            </div>
            <ul className="space-y-2">
              {branches.map((b) => (
                <li key={b.branchId}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void completeLogin({ selectedBranchId: b.branchId })
                    }
                    className="flex w-full flex-col rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="text-base font-semibold text-gray-900">
                      {b.branchName.replace(/^สาขา\s*/, "")}
                    </span>
                    {b.brandName ? (
                      <span className="mt-0.5 text-xs text-gray-500">
                        {b.brandName}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setBranches(null);
                resetOtp();
                setError("");
              }}
              className="w-full py-2 text-sm font-medium text-gray-600"
            >
              ใช้เบอร์อื่น
            </button>
            {error ? (
              <p className="text-base text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            {loading ? (
              <p className="text-center text-sm text-gray-500">กำลังเข้าสู่ระบบ...</p>
            ) : null}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            {otpStep ? (
              <>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    ยืนยันเบอร์ {formatThaiPhone(phone)}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {otpRefNo
                      ? `เลขอ้างอิง ${otpRefNo} — เทียบกับข้อความ SMS`
                      : "กรอกรหัส 4–6 หลักจากข้อความ SMS — ยืนยันครั้งเดียวต่อเบอร์"}
                  </p>
                </div>
                <div>
                  <label htmlFor="staff-otp" className={merchantLabelClass}>
                    รหัส OTP
                  </label>
                  <input
                    id="staff-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    className={`${merchantInputClass} text-center tracking-[0.35em]`}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                    }
                    placeholder="••••••"
                    required
                    autoFocus
                  />
                  <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="font-medium text-gray-500"
                      onClick={() => {
                        resetOtp();
                        setError("");
                      }}
                    >
                      เปลี่ยนเบอร์
                    </button>
                    <button
                      type="button"
                      disabled={loading || resendIn > 0}
                      className="font-medium text-site-primary disabled:opacity-40"
                      onClick={() => {
                        void (async () => {
                          setError("");
                          setLoading(true);
                          const sendErr = await sendStaffOtp();
                          if (sendErr) setError(sendErr);
                          setLoading(false);
                        })();
                      }}
                    >
                      {resendIn > 0 ? `ขอรหัสใหม่ใน ${resendIn}s` : "ขอรหัสใหม่"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
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
                      ครั้งแรกจะส่งรหัส OTP เพื่อยืนยันว่าเป็นเจ้าของเบอร์
                      — ครั้งถัดไปเข้าได้เลย
                    </p>
                    <p>เข้าใช้งานได้พร้อมกันสูงสุด 3 เครื่องต่อเบอร์</p>
                  </div>
                </div>
              </>
            )}

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
              {loading
                ? otpStep
                  ? "กำลังยืนยัน..."
                  : "กำลังเข้าสู่ระบบ..."
                : otpStep
                  ? "ยืนยันรหัส"
                  : "ถัดไป"}
            </button>
          </form>
        )}
      </div>
      {notice ? (
        <StaffLoginNotice
          kind={notice}
          phone={phone}
          onClose={() => setNotice(null)}
        />
      ) : null}
    </main>
  );
}

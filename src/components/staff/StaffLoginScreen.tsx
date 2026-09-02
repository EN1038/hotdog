"use client";

import { useEffect, useState } from "react";
import { MerchantAuthShell } from "@/components/MerchantAuthShell";
import { syncStaffBrandFromLogin } from "@/components/staff/StaffBrandingShell";
import {
  AuthBranchOption,
  AuthHintBanner,
  AuthOtpMetaRow,
  AuthSecondaryButton,
  AuthSectionHeading,
  authErrorClass,
  authLabelClass,
} from "@/components/merchant-auth-register-ui";
import {
  RegisterPhoneField,
  RegisterPrimaryButton,
} from "@/components/owner/owner-register-ui";
import { OtpDigitInput } from "@/components/OtpDigitInput";
import { formatThaiPhone } from "@/lib/constants";
import { getStaffDeviceId } from "@/lib/staff-device";
import {
  OTP_TTL_SECONDS,
  formatOtpCountdown,
} from "@/lib/otp-ttl";
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
  branchKind?: "STORE" | "WAREHOUSE";
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
  const [expiresIn, setExpiresIn] = useState(0);
  const [notice, setNotice] = useState<StaffLoginNoticeKind | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const t = window.setTimeout(() => setExpiresIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [expiresIn]);

  function resetOtp() {
    setOtpStep(false);
    setOtpCode("");
    setChallengeId(null);
    setOtpRefNo(null);
    setResendIn(0);
    setExpiresIn(0);
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
      expiresIn?: number;
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
    setExpiresIn(
      typeof data.expiresIn === "number" && data.expiresIn > 0
        ? data.expiresIn
        : OTP_TTL_SECONDS,
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
      if (expiresIn <= 0) {
        setError("รหัสหมดอายุ กรุณาขอรหัสใหม่");
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

  function handleHeaderBack() {
    setError("");
    if (branches) {
      setBranches(null);
      resetOtp();
      return;
    }
    if (otpStep) {
      resetOtp();
    }
  }

  const showFlowBack = Boolean(branches) || otpStep;

  const primaryLabel = loading
    ? otpStep
      ? "กำลังยืนยัน..."
      : "กำลังเข้าสู่ระบบ..."
    : otpStep
      ? expiresIn <= 0
        ? "รหัสหมดอายุ"
        : "ยืนยันรหัส"
      : "ถัดไป";

  return (
    <>
      <MerchantAuthShell
        title="เข้าใช้งานพนักงาน"
        subtitle="ใช้เบอร์ที่เจ้าของร้านลงทะเบียนไว้"
        onBack={showFlowBack ? handleHeaderBack : undefined}
        backHref="/"
      >
        {branches ? (
          <div className="space-y-4">
            <AuthSectionHeading
              title="เลือกสาขา"
              description="เบอร์นี้ทำงานได้หลายสาขา — เลือกสาขาที่ต้องการเข้าวันนี้"
            />
            <ul className="space-y-2">
              {branches
                .filter((b) => b.branchKind !== "WAREHOUSE")
                .map((b) => (
                  <li key={b.branchId}>
                    <AuthBranchOption
                      branchName={b.branchName}
                      brandName={b.brandName}
                      branchKind={b.branchKind}
                      disabled={loading}
                      onClick={() =>
                        void completeLogin({ selectedBranchId: b.branchId })
                      }
                    />
                  </li>
                ))}
            </ul>
            <AuthSecondaryButton
              disabled={loading}
              onClick={() => {
                setBranches(null);
                resetOtp();
                setError("");
              }}
            >
              ใช้เบอร์อื่น
            </AuthSecondaryButton>
            {error ? (
              <p className={authErrorClass} role="alert">
                {error}
              </p>
            ) : null}
            {loading ? (
              <p className="text-center text-[14px] text-slate-500">
                กำลังเข้าสู่ระบบ...
              </p>
            ) : null}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {otpStep ? (
              <>
                <AuthSectionHeading
                  title={`ยืนยันเบอร์ ${formatThaiPhone(phone)}`}
                  description={
                    otpRefNo
                      ? `เลขอ้างอิง ${otpRefNo} — เทียบกับข้อความ SMS`
                      : "กรอกรหัส 4 หลักจากข้อความ SMS — ยืนยันครั้งเดียวต่อเบอร์"
                  }
                />
                <div>
                  <label
                    id="staff-otp-label"
                    htmlFor="staff-otp"
                    className={authLabelClass}
                  >
                    รหัส OTP
                  </label>
                  <OtpDigitInput
                    id="staff-otp"
                    value={otpCode}
                    onChange={setOtpCode}
                    autoFocus
                    className="mt-2"
                  />
                  <p
                    className={`mt-2 text-center text-[15px] font-medium ${
                      expiresIn <= 0 ? "text-red-600" : "text-slate-500"
                    }`}
                  >
                    {expiresIn > 0
                      ? `รหัสใช้ได้ 5 นาที — หมดอายุใน ${formatOtpCountdown(expiresIn)}`
                      : "รหัสหมดอายุแล้ว — กดขอรหัสใหม่"}
                  </p>
                  <AuthOtpMetaRow
                    left="เปลี่ยนเบอร์"
                    right={resendIn > 0 ? `ขอรหัสใหม่ใน ${resendIn}s` : "ขอรหัสใหม่"}
                    onLeftClick={() => {
                      resetOtp();
                      setError("");
                    }}
                    onRightClick={() => {
                      void (async () => {
                        setError("");
                        setLoading(true);
                        const sendErr = await sendStaffOtp();
                        if (sendErr) setError(sendErr);
                        setLoading(false);
                      })();
                    }}
                    rightDisabled={loading || resendIn > 0}
                  />
                </div>
              </>
            ) : (
              <>
                <RegisterPhoneField
                  id="staff-phone"
                  label="เบอร์โทรสำหรับเข้าใช้งาน"
                  hint="ใช้เบอร์ที่เจ้าของร้านลงทะเบียนไว้"
                  value={phone}
                  onChange={setPhone}
                  className="mt-0"
                />

                <AuthHintBanner>
                  <p>ขอเบอร์ที่ลงทะเบียนได้ที่เจ้าของร้าน</p>
                  <p>
                    ครั้งแรกจะส่งรหัส OTP เพื่อยืนยันว่าเป็นเจ้าของเบอร์
                    — ครั้งถัดไปเข้าได้เลย
                  </p>
                  <p>เข้าใช้งานได้พร้อมกันสูงสุด 3 เครื่องต่อเบอร์</p>
                </AuthHintBanner>
              </>
            )}

            {error ? (
              <p className={authErrorClass} role="alert">
                {error}
              </p>
            ) : null}

            <RegisterPrimaryButton
              type="submit"
              disabled={loading || (otpStep && expiresIn <= 0) || (!otpStep && phone.length < 9)}
              loading={loading}
            >
              {primaryLabel}
            </RegisterPrimaryButton>
          </form>
        )}
      </MerchantAuthShell>
      {notice ? (
        <StaffLoginNotice
          kind={notice}
          phone={phone}
          onClose={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}

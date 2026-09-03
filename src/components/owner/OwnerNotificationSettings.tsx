"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PhoneInput } from "@/components/PhoneInput";
import { OtpDigitInput, OTP_DIGIT_LENGTH } from "@/components/OtpDigitInput";
import { useToast } from "@/components/admin/Toast";
import { OwnerSmsQuotaCard } from "@/components/owner/OwnerSmsQuotaCard";
import { IconLine } from "@/components/owner/owner-register-ui";
import { IconPhone } from "@/components/icons";
import { formatThaiPhone } from "@/lib/constants";
import {
  OTP_TTL_SECONDS,
  formatOtpCountdown,
} from "@/lib/otp-ttl";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

type BranchRow = {
  id: string;
  name: string;
  kind: string;
  isTest: boolean;
  operatingMode: string;
  alertSmsPhone: string | null;
  smsNotifyNewOrder: boolean;
  smsNotifySkewerOrder: boolean;
};

type NotificationPayload = {
  brand: {
    id: string;
    name: string;
    lineNotifyNewOrder: boolean;
    lineNotifySkewerOrder: boolean;
    lineNotifyDailySummary: boolean;
  };
  sms: { granted: number; used: number; remaining: number };
  line: {
    platformReady: boolean;
    linkedOwnerCount: number;
    connectUrl: string;
  };
  branches: BranchRow[];
};

function NotifyToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        checked ? "bg-site-primary" : "bg-slate-300"
      }`}
    >
      <span
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition"
        style={{ left: checked ? "1.65rem" : "0.2rem" }}
      />
    </button>
  );
}

function NotifyChannelRow({
  title,
  subtitle,
  icon,
  open,
  onToggle,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div
      className={`rounded-2xl border transition ${
        open
          ? "border-site-primary-soft bg-site-primary-banner"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
            {subtitle}
          </p>
        </div>
        <NotifyToggleSwitch
          checked={open}
          onChange={onToggle}
          label={`${open ? "ปิด" : "เปิด"}${title}`}
        />
      </div>
    </div>
  );
}

export function OwnerNotificationSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<NotificationPayload | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otpRefNo, setOtpRefNo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/notifications");
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = (await res.json()) as NotificationPayload;
      setData(json);

      const smsBranches = json.branches.filter(
        (b) => b.kind !== "WAREHOUSE" && !b.isTest,
      );
      const activeSms = smsBranches.some(
        (b) =>
          Boolean(b.alertSmsPhone?.trim()) &&
          (b.smsNotifyNewOrder || b.smsNotifySkewerOrder),
      );
      const savedPhone = smsBranches.find((b) => b.alertSmsPhone)?.alertSmsPhone ?? "";

      if (activeSms && savedPhone) {
        setSmsOpen(true);
        setLineOpen(false);
        setPhone(savedPhone);
        setVerifiedPhone(savedPhone);
      } else if (
        json.brand.lineNotifyNewOrder ||
        json.brand.lineNotifySkewerOrder ||
        json.brand.lineNotifyDailySummary
      ) {
        setSmsOpen(false);
        setLineOpen(true);
        setPhone("");
        setVerifiedPhone(null);
      } else {
        setSmsOpen(true);
        setLineOpen(false);
        setPhone(savedPhone);
        setVerifiedPhone(savedPhone || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const phoneChanged = useMemo(() => {
    if (!verifiedPhone) return phone.length >= 9;
    return phone !== verifiedPhone;
  }, [phone, verifiedPhone]);

  function resetOtp() {
    setOtpStep(false);
    setOtpCode("");
    setChallengeId("");
    setOtpRefNo(null);
    setResendIn(0);
    setExpiresIn(0);
  }

  async function sendOtp() {
    if (phone.length < 9) {
      toast.error("กรุณากรอกเบอร์ให้ครบ");
      return;
    }
    setSendingOtp(true);
    try {
      const res = await fetch("/api/owner/notifications/verify-phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ส่ง OTP ไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      setChallengeId(json.challengeId ?? "");
      setOtpRefNo(json.otpRefNo ?? null);
      setOtpStep(true);
      setOtpCode("");
      setResendIn(
        typeof json.resendIn === "number" ? json.resendIn : 60,
      );
      setExpiresIn(
        typeof json.expiresIn === "number" ? json.expiresIn : OTP_TTL_SECONDS,
      );
    } catch {
      toast.error("ส่ง OTP ไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSendingOtp(false);
    }
  }

  async function confirmOtp() {
    if (!challengeId || otpCode.replace(/\D/g, "").length < OTP_DIGIT_LENGTH) {
      toast.error("กรุณากรอกรหัส OTP ให้ครบ");
      return;
    }
    if (expiresIn <= 0) {
      toast.error("รหัสหมดอายุ", "กรุณาขอรหัสใหม่");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/owner/notifications/verify-phone/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, challengeId, otpCode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ยืนยันไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      setVerifiedPhone(json.phone ?? phone);
      resetOtp();
      toast.success("ยืนยันเบอร์แล้ว", "บันทึกการแจ้งเตือน SMS เรียบร้อย");
      await load();
    } catch {
      toast.error("ยืนยันไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function saveLineChannel() {
    setSaving(true);
    try {
      const res = await fetch("/api/owner/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationChannel: "line" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("บันทึกไม่สำเร็จ", err.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      toast.success("บันทึกแล้ว", "ตั้งค่าแจ้งเตือนผ่าน LINE");
      resetOtp();
      await load();
    } catch {
      toast.error("บันทึกไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  function toggleSms(next: boolean) {
    setSmsOpen(next);
    if (next) resetOtp();
  }

  function toggleLine(next: boolean) {
    setLineOpen(next);
    if (!next) resetOtp();
  }

  if (loading) {
    return (
      <section className="rounded-3xl bg-white px-4 py-5 text-sm text-slate-500 shadow-sm">
        กำลังโหลดการตั้งค่าแจ้งเตือน…
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="space-y-4 rounded-3xl bg-white px-4 py-5 shadow-sm">
      <div>
        <h2 className="text-[17px] font-extrabold text-slate-900">แจ้งเตือน</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          เปิดช่องทางที่ต้องการตั้งค่า
        </p>
      </div>

      <div className="space-y-3">
        <NotifyChannelRow
          title="SMS"
          subtitle="ส่งไปเบอร์โทร — ต้องยืนยัน OTP ก่อนใช้งาน"
          open={smsOpen}
          onToggle={toggleSms}
          icon={
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-site-primary-soft text-site-primary">
              <IconPhone size={20} />
            </span>
          }
        />
        {smsOpen ? (
          <div className="space-y-3 pl-1">
            <OwnerSmsQuotaCard quota={data.sms} manageHref={undefined} />
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <label
                  htmlFor="owner-alert-phone"
                  className="mb-2 block text-[14px] font-medium text-slate-500"
                >
                  เบอร์รับ SMS
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-site-primary-soft text-site-primary">
                      <IconPhone size={18} />
                    </span>
                  </span>
                  <PhoneInput
                    id="owner-alert-phone"
                    value={phone}
                    onChange={(digits) => {
                      setPhone(digits);
                      if (verifiedPhone && digits !== verifiedPhone) {
                        resetOtp();
                      }
                    }}
                    disabled={otpStep}
                    className="w-full min-h-[3.75rem] rounded-2xl border border-slate-100 bg-white py-3 pl-[3.75rem] pr-4 text-[17px] font-semibold text-slate-900 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.1)] focus:border-site-primary-focus focus:outline-none focus:ring-2 focus:ring-site-primary-focus"
                  />
                </div>
                {verifiedPhone && !phoneChanged ? (
                  <p className="mt-2 text-[13px] font-semibold text-site-primary">
                    ยืนยันแล้ว · {formatThaiPhone(verifiedPhone)}
                  </p>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-400">
                    กรอกเบอร์แล้วกดส่ง OTP เพื่อยืนยันก่อนรับแจ้งเตือน
                  </p>
                )}
              </div>

              {otpStep ? (
                <div>
                  <p className="text-[14px] text-slate-600">
                    ส่งรหัสไปที่ {formatThaiPhone(phone)}
                    {otpRefNo ? ` (Ref: ${otpRefNo})` : ""}
                  </p>
                  <label
                    id="owner-alert-otp-label"
                    htmlFor="owner-alert-otp"
                    className="mb-2 mt-4 block text-[14px] font-medium text-slate-500"
                  >
                    รหัส OTP
                  </label>
                  <OtpDigitInput
                    id="owner-alert-otp"
                    value={otpCode}
                    onChange={setOtpCode}
                    autoFocus
                    className="mt-1"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                    <span
                      className={
                        expiresIn <= 0 ? "text-red-600" : "text-slate-500"
                      }
                    >
                      {expiresIn > 0
                        ? `หมดอายุใน ${formatOtpCountdown(expiresIn)}`
                        : "รหัสหมดอายุแล้ว"}
                    </span>
                    <button
                      type="button"
                      disabled={sendingOtp || resendIn > 0}
                      onClick={() => void sendOtp()}
                      className="font-semibold text-site-primary disabled:opacity-40"
                    >
                      {resendIn > 0 ? `ขอใหม่ ${resendIn}s` : "ขอรหัสใหม่"}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={
                      saving ||
                      expiresIn <= 0 ||
                      otpCode.replace(/\D/g, "").length < OTP_DIGIT_LENGTH
                    }
                    onClick={() => void confirmOtp()}
                    className="mt-4 min-h-[3.25rem] w-full rounded-2xl bg-site-primary text-[16px] font-bold text-white active:bg-site-primary-active disabled:opacity-50"
                  >
                    {saving ? "กำลังยืนยัน…" : "ยืนยันเบอร์"}
                  </button>
                </div>
              ) : phoneChanged || !verifiedPhone ? (
                <button
                  type="button"
                  disabled={sendingOtp || phone.length < 9}
                  onClick={() => void sendOtp()}
                  className="min-h-[3.25rem] w-full rounded-2xl bg-site-primary text-[16px] font-bold text-white active:bg-site-primary-active disabled:opacity-50"
                >
                  {sendingOtp ? "กำลังส่ง OTP…" : "ส่งรหัส OTP"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <NotifyChannelRow
          title="LINE"
          subtitle="ติดต่อเจ้าหน้าที่ SkillSale"
          open={lineOpen}
          onToggle={toggleLine}
          icon={
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#06C755]/10 text-[#06C755]">
              <IconLine className="h-6 w-6" />
            </span>
          }
        />
        {lineOpen ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 pl-1">
            <p className="text-[14px] leading-relaxed text-slate-600">
              แจ้งเตือนผ่าน LINE — ติดต่อทีม SkillSale เพื่อตั้งค่าและรับแจ้งเตือนจากร้าน
            </p>
            <a
              href={PLATFORM_LINE_ADD_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void saveLineChannel()}
              className="flex min-h-[3.5rem] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#06C755] px-4 text-[16px] font-extrabold text-white shadow-sm transition active:brightness-95"
            >
              <IconLine className="h-5 w-5 shrink-0" />
              ติดต่อเจ้าหน้าที่ SkillSale
            </a>
            {data.line.linkedOwnerCount > 0 ? (
              <p className="text-[13px] text-site-primary">
                เชื่อม LINE แล้ว {data.line.linkedOwnerCount} บัญชี
              </p>
            ) : null}
            {!data.line.platformReady ? (
              <p className="text-[13px] text-amber-700">
                ระบบ LINE ยังไม่พร้อม — ติดต่อทีม SkillSale
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

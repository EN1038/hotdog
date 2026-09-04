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
    lineMessagingEnabled: boolean;
    hasAccessToken: boolean;
    hasChannelSecret: boolean;
  };
  sms: { granted: number; used: number; remaining: number };
  line: {
    ready: boolean;
    configured: boolean;
    messagingEnabled: boolean;
    webhookUrl: string;
    linkedOwnerCount: number;
    linkedStaffCount: number;
    selfLinked: boolean;
    activeCode: string | null;
    codeExpiresAt: string | null;
  };
  branches: BranchRow[];
};

function NotifyToggleSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-40 ${
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

  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [testing, setTesting] = useState(false);

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
      const savedPhone =
        smsBranches.find((b) => b.alertSmsPhone)?.alertSmsPhone ?? "";
      const lineFlagsOn =
        json.brand.lineNotifyNewOrder ||
        json.brand.lineNotifySkewerOrder ||
        json.brand.lineNotifyDailySummary;
      const activeLine =
        json.line.configured &&
        (lineFlagsOn || json.line.messagingEnabled || json.line.selfLinked);

      if (activeSms && savedPhone) {
        setSmsOpen(true);
        setLineOpen(false);
        setPhone(savedPhone);
        setVerifiedPhone(savedPhone);
      } else if (activeLine) {
        setSmsOpen(false);
        setLineOpen(true);
        setPhone("");
        setVerifiedPhone(null);
      } else {
        setSmsOpen(false);
        setLineOpen(false);
        setPhone(savedPhone);
        setVerifiedPhone(savedPhone || null);
      }

      if (json.line.activeCode && json.line.codeExpiresAt) {
        setLinkCode(json.line.activeCode);
        setCodeExpiresAt(json.line.codeExpiresAt);
      } else {
        setLinkCode(null);
        setCodeExpiresAt(null);
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingSec = codeExpiresAt
    ? Math.max(0, Math.floor((new Date(codeExpiresAt).getTime() - now) / 1000))
    : 0;

  useEffect(() => {
    if (codeExpiresAt && remainingSec <= 0) {
      setLinkCode(null);
      setCodeExpiresAt(null);
    }
  }, [codeExpiresAt, remainingSec]);

  const phoneChanged = useMemo(() => {
    if (!verifiedPhone) return phone.length >= 9;
    return phone !== verifiedPhone;
  }, [phone, verifiedPhone]);

  const smsVerified = Boolean(verifiedPhone && !phoneChanged);

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
        toast.error("ส่งรหัสไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      setChallengeId(json.challengeId ?? "");
      setOtpRefNo(json.otpRefNo ?? null);
      setOtpStep(true);
      setOtpCode("");
      setResendIn(typeof json.resendIn === "number" ? json.resendIn : 60);
      setExpiresIn(
        typeof json.expiresIn === "number" ? json.expiresIn : OTP_TTL_SECONDS,
      );
    } catch {
      toast.error("ส่งรหัสไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSendingOtp(false);
    }
  }

  async function confirmOtp() {
    if (!challengeId || otpCode.replace(/\D/g, "").length < OTP_DIGIT_LENGTH) {
      toast.error("กรุณากรอกรหัสให้ครบ");
      return;
    }
    if (expiresIn <= 0) {
      toast.error("รหัสหมดอายุแล้ว", "กรุณาขอรหัสใหม่");
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
      toast.success("ยืนยันเบอร์แล้ว", "พร้อมรับแจ้งเตือนทาง SMS");
      await load();
      setSmsOpen(true);
      setLineOpen(false);
    } catch {
      toast.error("ยืนยันไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function patchLine(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/owner/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return false;
      }
      setData(json as NotificationPayload);
      return true;
    } catch {
      toast.error("บันทึกไม่สำเร็จ", "เชื่อมต่อไม่ได้");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveCredentials() {
    const body: Record<string, unknown> = {};
    if (token.trim()) body.channelAccessToken = token.trim();
    if (secret.trim()) body.channelSecret = secret.trim();
    if (Object.keys(body).length === 0) {
      toast.error("กรอก Channel access token หรือ Channel secret");
      return;
    }
    const ok = await patchLine(body);
    if (ok) {
      setToken("");
      setSecret("");
      toast.success("บันทึก Channel แล้ว");
    }
  }

  async function copyWebhook() {
    if (!data?.line.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(data.line.webhookUrl);
      toast.success("คัดลอก Webhook URL แล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  async function issueLinkCode() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/me/line-link", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างรหัสไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      setLinkCode(json.code ?? null);
      setCodeExpiresAt(json.expiresAt ?? null);
      toast.success("สร้างรหัสแล้ว — ส่งในแชท OA ของร้านภายใน 10 นาที");
      await load();
      setLineOpen(true);
    } catch {
      toast.error("สร้างรหัสไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function unlinkLine() {
    if (!confirm("ยกเลิกการเชื่อม LINE ของบัญชีนี้?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/me/line-link", { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error("ยกเลิกไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      toast.success("ยกเลิกการเชื่อมแล้ว");
      await load();
      setLineOpen(true);
    } catch {
      toast.error("ยกเลิกไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/owner/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ส่งทดสอบไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      toast.success("ส่งข้อความทดสอบแล้ว — ตรวจใน LINE");
    } catch {
      toast.error("ส่งทดสอบไม่สำเร็จ", "เชื่อมต่อไม่ได้");
    } finally {
      setTesting(false);
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
          เลือกวิธีรับแจ้งเตือนเมื่อมีออเดอร์ใหม่
        </p>
      </div>

      <div className="space-y-3">
        <NotifyChannelRow
          title="SMS"
          subtitle="รับข้อความที่เบอร์โทร ต้องยืนยันรหัสก่อนใช้งาน"
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
            {smsVerified ? <OwnerSmsQuotaCard quota={data.sms} /> : null}
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <label
                  htmlFor="owner-alert-phone"
                  className="mb-2 block text-[14px] font-medium text-slate-500"
                >
                  เบอร์โทรที่รับแจ้งเตือน
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
                {smsVerified ? (
                  <p className="mt-2 text-[13px] font-semibold text-site-primary">
                    ยืนยันแล้ว ใช้งานที่ {formatThaiPhone(verifiedPhone!)}
                  </p>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-400">
                    กรอกเบอร์โทร แล้วกดส่งรหัสเพื่อยืนยัน
                  </p>
                )}
              </div>

              {otpStep ? (
                <div>
                  <p className="text-[14px] text-slate-600">
                    ส่งรหัสไปที่ {formatThaiPhone(phone)}
                    {otpRefNo ? ` รหัสอ้างอิง ${otpRefNo}` : ""}
                  </p>
                  <label
                    id="owner-alert-otp-label"
                    htmlFor="owner-alert-otp"
                    className="mb-2 mt-4 block text-[14px] font-medium text-slate-500"
                  >
                    รหัสยืนยัน
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
                      {resendIn > 0 ? `ขอใหม่ ${resendIn} วินาที` : "ขอรหัสใหม่"}
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
                  {sendingOtp ? "กำลังส่งรหัส…" : "ส่งรหัสยืนยัน"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <NotifyChannelRow
          title="LINE"
          subtitle="ใช้ Official Account ของร้านรับแจ้งออเดอร์"
          open={lineOpen}
          onToggle={toggleLine}
          icon={
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#06C755]/10 text-[#06C755]">
              <IconLine className="h-6 w-6" />
            </span>
          }
        />
        {lineOpen ? (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="space-y-2">
              <p className="text-[14px] font-semibold text-slate-800">
                1. ใส่ Channel จาก LINE Developers
              </p>
              <p className="text-[13px] text-slate-500">
                Messaging API → Channel access token และ Channel secret ของ OA
                ร้าน
              </p>
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  data.brand.hasAccessToken
                    ? "มี token แล้ว — วางใหม่เพื่อเปลี่ยน"
                    : "Channel access token"
                }
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px]"
              />
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  data.brand.hasChannelSecret
                    ? "มี secret แล้ว — วางใหม่เพื่อเปลี่ยน"
                    : "Channel secret"
                }
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px]"
              />
              <button
                type="button"
                disabled={saving || (!token.trim() && !secret.trim())}
                onClick={() => void saveCredentials()}
                className="min-h-[2.75rem] w-full rounded-xl bg-slate-900 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {saving ? "กำลังบันทึก…" : "บันทึก Channel"}
              </button>
              <div className="flex flex-wrap gap-2 text-[12px]">
                <span
                  className={
                    data.brand.hasAccessToken
                      ? "text-site-primary"
                      : "text-amber-700"
                  }
                >
                  Token {data.brand.hasAccessToken ? "✓" : "ยังไม่มี"}
                </span>
                <span
                  className={
                    data.brand.hasChannelSecret
                      ? "text-site-primary"
                      : "text-amber-700"
                  }
                >
                  Secret {data.brand.hasChannelSecret ? "✓" : "ยังไม่มี"}
                </span>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-[14px] font-semibold text-slate-800">
                2. ตั้ง Webhook URL ใน LINE Developers
              </p>
              <code className="block break-all rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                {data.line.webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyWebhook()}
                className="text-[13px] font-semibold text-site-primary"
              >
                คัดลอก URL
              </button>
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-slate-800">
                    เปิดการแจ้งเตือน LINE
                  </p>
                  <p className="text-[12px] text-slate-500">
                    Master switch ของ Messaging API ร้าน
                  </p>
                </div>
                <NotifyToggleSwitch
                  checked={data.line.messagingEnabled}
                  disabled={saving || !data.line.configured}
                  label="เปิดการแจ้งเตือน LINE"
                  onChange={(next) => {
                    void patchLine({ messagingEnabled: next }).then((ok) => {
                      if (ok) toast.success(next ? "เปิดแล้ว" : "ปิดแล้ว");
                    });
                  }}
                />
              </div>
              {(
                [
                  ["lineNotifyNewOrder", "ออเดอร์ลูกค้าใหม่", data.brand.lineNotifyNewOrder],
                  [
                    "lineNotifySkewerOrder",
                    "สั่งเสียบไม้ใหม่",
                    data.brand.lineNotifySkewerOrder,
                  ],
                  [
                    "lineNotifyDailySummary",
                    "สรุปรอบ / สรุปวัน",
                    data.brand.lineNotifyDailySummary,
                  ],
                ] as const
              ).map(([key, label, checked]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3"
                >
                  <p className="text-[14px] text-slate-700">{label}</p>
                  <NotifyToggleSwitch
                    checked={checked}
                    disabled={saving || !data.line.messagingEnabled}
                    label={label}
                    onChange={(next) => {
                      void patchLine({ [key]: next }).then((ok) => {
                        if (ok) toast.success("อัปเดตแล้ว");
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-[14px] font-semibold text-slate-800">
                3. เชื่อมบัญชี LINE ของคุณ
              </p>
              <p className="text-[13px] text-slate-500">
                แอดเพื่อน OA ร้าน → กดสร้างรหัส → ส่งรหัส 6 หลักในแชท
              </p>
              {data.line.selfLinked ? (
                <p className="text-[13px] font-semibold text-site-primary">
                  เชื่อมแล้ว · เจ้าของ/ผู้จัดการที่เชื่อม {data.line.linkedOwnerCount}{" "}
                  · พนักงาน {data.line.linkedStaffCount}
                </p>
              ) : (
                <p className="text-[13px] text-amber-700">
                  ยังไม่ได้เชื่อมบัญชีนี้
                </p>
              )}
              {linkCode ? (
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
                  <p className="text-[28px] font-extrabold tracking-[0.35em] text-slate-900">
                    {linkCode}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    เหลือ {Math.floor(remainingSec / 60)}:
                    {String(remainingSec % 60).padStart(2, "0")} นาที
                  </p>
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void issueLinkCode()}
                  className="min-h-[2.75rem] flex-1 rounded-xl bg-[#06C755] text-[14px] font-bold text-white disabled:opacity-40"
                >
                  {linkCode ? "สร้างรหัสใหม่" : "สร้างรหัสเชื่อม LINE"}
                </button>
                {data.line.selfLinked ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void unlinkLine()}
                    className="min-h-[2.75rem] rounded-xl border border-slate-200 px-4 text-[14px] font-semibold text-slate-600 disabled:opacity-40"
                  >
                    ยกเลิกการเชื่อม
                  </button>
                ) : null}
              </div>
              <p className="text-[12px] text-slate-400">
                พนักงาน: แอดเพื่อน OA แล้วพิมพ์เบอร์โทรในระบบ
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={
                  testing || saving || !data.line.ready || !data.line.selfLinked
                }
                onClick={() => void sendTest()}
                className="min-h-[2.75rem] w-full rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-800 disabled:opacity-40"
              >
                {testing ? "กำลังส่ง…" : "ส่งข้อความทดสอบ"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

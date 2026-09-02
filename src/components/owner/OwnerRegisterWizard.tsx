"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlatformMark } from "@/components/PlatformMark";
import { PhoneInput } from "@/components/PhoneInput";
import {
  merchantButtonClass,
  merchantInputClass,
  merchantLabelClass,
} from "@/components/merchant-login-ui";
import {
  OTP_TTL_SECONDS,
  formatOtpCountdown,
} from "@/lib/otp-ttl";
import {
  OWNER_REGISTER_IMPORT_OPTIONS,
  OWNER_REGISTER_TRIAL_DAYS,
  OWNER_SHOP_CATEGORIES,
  categoryAllowsMasterImport,
  type OwnerRegisterImportLevel,
  type OwnerShopCategoryId,
} from "@/lib/owner-register-shared";
import {
  PLATFORM_LINE_ADD_URL,
  PLATFORM_LINE_QR_SRC,
} from "@/lib/platform-support";

type RegisterMode = "self" | "line";

type Step = "phone" | "otp" | "staff_ack" | "category" | "shop" | "creating" | "done";

type ExistingStaffBrand = {
  brandId: string;
  brandName: string;
  brandCode: string;
  branches: { branchId: string; branchName: string }[];
};

type CreateStage =
  | "verify"
  | "brand"
  | "branch"
  | "import"
  | "session"
  | "complete";

const CREATE_STAGES: { id: CreateStage; label: string }[] = [
  { id: "verify", label: "ยืนยันเบอร์โทร" },
  { id: "brand", label: "สร้างร้านค้า" },
  { id: "branch", label: "สร้างสาขาหลัก" },
  { id: "import", label: "นำเข้าเมนูตั้งต้น" },
  { id: "session", label: "เตรียมเข้าใช้งาน" },
  { id: "complete", label: "เสร็จสิ้น" },
];

export function OwnerRegisterWizard() {
  const [registerMode, setRegisterMode] = useState<RegisterMode>("self");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otpRefNo, setOtpRefNo] = useState("");
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [shopCategory, setShopCategory] =
    useState<OwnerShopCategoryId>("mala_hotpot");
  const [shopName, setShopName] = useState("");
  const [importMaster, setImportMaster] =
    useState<OwnerRegisterImportLevel>("full");
  const [createStage, setCreateStage] = useState<CreateStage>("verify");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingStaffBrands, setExistingStaffBrands] = useState<
    ExistingStaffBrand[]
  >([]);
  const [staffAcknowledged, setStaffAcknowledged] = useState(false);
  const [resultSummary, setResultSummary] = useState<{
    shopName: string;
    trialEndsAt: string;
    importSummary: {
      menuItems: number;
      categories: number;
    } | null;
  } | null>(null);

  useEffect(() => {
    if (step !== "otp" || otpSecondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setOtpSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, otpSecondsLeft]);

  async function sendOtp() {
    if (phone.length < 9) {
      setError("กรุณากรอกเบอร์โทรให้ครบ");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "owner_register" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "ส่ง OTP ไม่สำเร็จ");
        if (data.redirect) {
          setError(`${data.error ?? "สมัครแล้ว"} — ไปหน้าเข้าสู่ระบบ`);
        }
        return;
      }
      setChallengeId(data.challengeId ?? "");
      setOtpRefNo(data.otpRefNo ?? "");
      setExistingStaffBrands(
        Array.isArray(data.existingStaffBrands)
          ? (data.existingStaffBrands as ExistingStaffBrand[])
          : [],
      );
      setStaffAcknowledged(false);
      setOtpSecondsLeft(
        typeof data.expiresIn === "number" ? data.expiresIn : OTP_TTL_SECONDS,
      );
      setOtpCode("");
      setStep("otp");
    } catch {
      setError("เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration() {
    if (shopName.trim().length < 2) {
      setError("กรุณากรอกชื่อร้าน");
      return;
    }
    setStep("creating");
    setCreateStage("verify");
    setError("");
    setLoading(true);

    const stageTimer = window.setInterval(() => {
      setCreateStage((prev) => {
        const idx = CREATE_STAGES.findIndex((s) => s.id === prev);
        if (idx < 0 || idx >= CREATE_STAGES.length - 2) return prev;
        return CREATE_STAGES[idx + 1]!.id;
      });
    }, 900);

    try {
      const res = await fetch("/api/owner/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          challengeId,
          otpCode: otpCode.trim(),
          shopName: shopName.trim(),
          shopCategory,
          importMaster: categoryAllowsMasterImport(shopCategory)
            ? importMaster
            : "none",
          acknowledgeExistingStaff:
            existingStaffBrands.length === 0 || staffAcknowledged,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        clearInterval(stageTimer);
        if (data.code === "EXISTING_STAFF" && Array.isArray(data.existingStaffBrands)) {
          setExistingStaffBrands(data.existingStaffBrands as ExistingStaffBrand[]);
          setStaffAcknowledged(false);
          setStep("staff_ack");
        }
        setError(data.error ?? "สมัครไม่สำเร็จ");
        if (data.code !== "EXISTING_STAFF") {
          setStep("shop");
        }
        return;
      }
      setCreateStage("complete");
      setResultSummary({
        shopName: data.shopName ?? shopName.trim(),
        trialEndsAt: data.trialEndsAt ?? "",
        importSummary: data.importSummary ?? null,
      });
      setStep("done");
      window.setTimeout(() => {
        window.location.assign(data.redirect ?? "/owner/welcome");
      }, 1200);
    } catch {
      clearInterval(stageTimer);
      setError("เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง");
      setStep("shop");
    } finally {
      clearInterval(stageTimer);
      setLoading(false);
    }
  }

  function handlePrimaryAction() {
    if (step === "phone") {
      void sendOtp();
      return;
    }
    if (step === "otp") {
      if (otpSecondsLeft <= 0) {
        setError("รหัสหมดอายุ — กดขอรหัสใหม่");
        return;
      }
      if (otpCode.trim().length < 4) {
        setError("กรุณากรอกรหัส OTP");
        return;
      }
      setError("");
      setStep(existingStaffBrands.length > 0 ? "staff_ack" : "category");
      return;
    }
    if (step === "staff_ack") {
      if (!staffAcknowledged) {
        setError("กรุณายืนยันว่าเข้าใจว่าเป็นการเปิดร้านใหม่แยกจากงานพนักงานเดิม");
        return;
      }
      setError("");
      setStep("category");
      return;
    }
    if (step === "category") {
      setError("");
      setStep("shop");
      return;
    }
    if (step === "shop") {
      void submitRegistration();
    }
  }

  const stepIndex =
    step === "phone"
      ? 0
      : step === "otp"
        ? 1
        : step === "staff_ack"
          ? 2
          : step === "category"
            ? 3
            : step === "shop"
              ? 4
              : 5;

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
          สมัครเป็นร้านค้า
        </h1>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
        <PlatformMark placement="login" height={36} priority />

        {step !== "creating" && step !== "done" ? (
          <div
            role="tablist"
            aria-label="วิธีสมัคร"
            className="relative z-20 mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={registerMode === "self"}
              onClick={() => {
                setRegisterMode("self");
                setError("");
              }}
              className={`rounded-xl py-2.5 text-[13px] font-extrabold transition ${
                registerMode === "self"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-slate-600"
              }`}
            >
              สมัครเอง
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={registerMode === "line"}
              onClick={() => {
                setRegisterMode("line");
                setError("");
              }}
              className={`rounded-xl py-2.5 text-[13px] font-extrabold transition ${
                registerMode === "line"
                  ? "bg-[#06C755] text-white shadow-sm"
                  : "text-slate-600"
              }`}
            >
              ติดต่อทีมงาน
            </button>
          </div>
        ) : null}

        {registerMode === "line" && step !== "creating" && step !== "done" ? (
          <>
            <p className="mt-5 text-lg font-bold text-gray-900">
              แอดไลน์ แล้วแอดมินสมัครให้
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              ไม่ต้องกรอกฟอร์มเอง — ส่งชื่อร้านมาทาง LINE ทีมงานจะเปิดบัญชีให้
            </p>

            <div className="mt-6 rounded-3xl bg-white p-6 text-center shadow-sm">
              <a
                href={PLATFORM_LINE_ADD_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={PLATFORM_LINE_QR_SRC}
                  alt="QR เพิ่มเพื่อน LINE SkillSale"
                  width={240}
                  height={240}
                  className="mx-auto h-56 w-56 object-contain"
                />
              </a>
              <p className="mt-3 text-sm font-medium text-gray-700">
                สแกน QR ด้วยแอป LINE
              </p>
            </div>

            <a
              href={PLATFORM_LINE_ADD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#06C755] px-4 py-4 text-base font-extrabold text-white shadow-sm active:scale-[0.99]"
            >
              เพิ่มเพื่อนใน LINE
            </a>

            <p className="mt-6 text-center text-sm text-gray-500">
              มีบัญชีแล้ว?{" "}
              <Link href="/owner/login" className="font-semibold text-site-primary">
                เข้าสู่ระบบ
              </Link>
            </p>
            <p className="mt-3 text-center text-xs text-gray-400">
              หรือ{" "}
              <button
                type="button"
                onClick={() => setRegisterMode("self")}
                className="font-semibold text-emerald-700 underline"
              >
                สมัครด้วยตัวเอง (OTP)
              </button>
            </p>
          </>
        ) : null}

        {registerMode === "self" && step !== "creating" && step !== "done" ? (
          <>
            <p className="mt-4 text-lg font-bold text-gray-900">
              เปิดร้านด้วยตัวเอง
            </p>
            <p className="mt-1 text-sm text-gray-600">
              ทดลองใช้ฟรี {OWNER_REGISTER_TRIAL_DAYS} วัน · สร้างสาขาหลักให้อัตโนมัติ
            </p>

            <div className="mt-4 flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i <= stepIndex ? "bg-emerald-600" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}

        {registerMode === "self" && step === "phone" ? (
          <div className="mt-6">
            <label className={merchantLabelClass}>เบอร์โทรเจ้าของร้าน</label>
            <PhoneInput
              value={phone}
              onChange={setPhone}
              className={merchantInputClass}
              autoFocus
            />
            <p className="mt-2 text-xs text-gray-500">
              ใช้เบอร์นี้เข้าระบบด้วย OTP ในครั้งถัดไป
            </p>
          </div>
        ) : null}

        {registerMode === "self" && step === "otp" ? (
          <div className="mt-6">
            <p className="text-sm text-gray-600">
              ส่งรหัสไปที่ {phone}
              {otpRefNo ? ` (Ref: ${otpRefNo})` : ""}
            </p>
            <label className={`${merchantLabelClass} mt-4`}>รหัส OTP</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              className={merchantInputClass}
              autoFocus
            />
            <p className="mt-2 text-xs text-gray-500">
              {otpSecondsLeft > 0
                ? `หมดอายุใน ${formatOtpCountdown(otpSecondsLeft)}`
                : "รหัสหมดอายุแล้ว — กดขอรหัสใหม่"}
            </p>
            <button
              type="button"
              onClick={() => void sendOtp()}
              disabled={loading || otpSecondsLeft > OTP_TTL_SECONDS - 30}
              className="mt-3 text-sm font-semibold text-site-primary disabled:opacity-40"
            >
              ขอรหัสใหม่
            </button>
          </div>
        ) : null}

        {registerMode === "self" && step === "staff_ack" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-950">
              <p className="text-[15px] font-bold">เบอร์นี้เป็นพนักงานอยู่แล้ว</p>
              <p className="mt-2 text-sm leading-relaxed">
                การสมัครครั้งนี้จะ<span className="font-semibold">เปิดร้านใหม่แยก</span>
                จากงานพนักงานเดิม — บัญชีเจ้าของและหน้าร้านพนักงานเป็นคนละส่วน
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {existingStaffBrands.map((brand) => (
                  <li
                    key={brand.brandId}
                    className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200"
                  >
                    <p className="font-semibold">{brand.brandName}</p>
                    <p className="text-xs text-amber-900/80">
                      {brand.branches.map((b) => b.branchName).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={staffAcknowledged}
                onChange={(e) => setStaffAcknowledged(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm leading-relaxed text-gray-800">
                เข้าใจแล้ว — ต้องการเปิดร้านใหม่ด้วยเบอร์นี้ และจะใช้{" "}
                <span className="font-semibold">/owner/login</span> สำหรับหลังบ้าน{" "}
                <span className="font-semibold">/staff/login</span> สำหรับงานพนักงานเดิม
              </span>
            </label>
          </div>
        ) : null}

        {registerMode === "self" && step === "category" ? (
          <div className="mt-6 space-y-2">
            <p className="text-sm font-semibold text-gray-800">ประเภทร้าน</p>
            {OWNER_SHOP_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setShopCategory(cat.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  shopCategory === cat.id
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                    : "border-gray-200 bg-white"
                }`}
              >
                <p className="text-[15px] font-bold text-gray-900">{cat.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{cat.hint}</p>
              </button>
            ))}
          </div>
        ) : null}

        {registerMode === "self" && step === "shop" ? (
          <div className="mt-6 space-y-4">
            <div>
              <label className={merchantLabelClass}>ชื่อร้าน</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="เช่น หม่าล่าบ้านสวน"
                className={merchantInputClass}
                autoFocus
                maxLength={80}
              />
            </div>

            {categoryAllowsMasterImport(shopCategory) ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-800">
                  เมนูตั้งต้น (ไม่บังคับ)
                </p>
                <div className="space-y-2">
                  {OWNER_REGISTER_IMPORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setImportMaster(opt.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                        importMaster === opt.id
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
                ประเภทนี้เริ่มเมนูว่าง — เพิ่มรายการขายได้หลังเข้าระบบ
              </p>
            )}

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
              ทดลองใช้ฟรี {OWNER_REGISTER_TRIAL_DAYS} วัน · เปิดครบทุกฟีเจอร์ · สร้างสาขา &quot;สาขาหลัก&quot;
              ให้อัตโนมัติ
            </div>
          </div>
        ) : null}

        {step === "creating" || step === "done" ? (
          <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-center text-lg font-bold text-gray-900">
              {step === "done" ? "สมัครสำเร็จ!" : "กำลังสร้างร้าน…"}
            </p>
            <ul className="mt-5 space-y-3">
              {CREATE_STAGES.map((stage) => {
                const stageIdx = CREATE_STAGES.findIndex((s) => s.id === stage.id);
                const currentIdx = CREATE_STAGES.findIndex(
                  (s) => s.id === createStage,
                );
                const done = stageIdx < currentIdx || createStage === "complete";
                const active = stage.id === createStage && createStage !== "complete";
                const skipImport =
                  stage.id === "import" &&
                  (!categoryAllowsMasterImport(shopCategory) ||
                    importMaster === "none");
                if (skipImport && !done) return null;
                return (
                  <li
                    key={stage.id}
                    className={`flex items-center gap-3 text-sm ${
                      done
                        ? "font-semibold text-emerald-700"
                        : active
                          ? "font-bold text-gray-900"
                          : "text-gray-400"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        done
                          ? "bg-emerald-600 text-white"
                          : active
                            ? "bg-gray-900 text-white"
                            : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {done ? "✓" : stageIdx + 1}
                    </span>
                    {stage.label}
                  </li>
                );
              })}
            </ul>
            {resultSummary?.importSummary ? (
              <p className="mt-4 text-center text-xs text-gray-600">
                นำเข้า {resultSummary.importSummary.menuItems} เมนู ·{" "}
                {resultSummary.importSummary.categories} หมวด
              </p>
            ) : null}
          </div>
        ) : null}

        {registerMode === "self" && error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {registerMode === "self" && step !== "creating" && step !== "done" ? (
          <div className="mt-auto space-y-3 pt-6">
            {step !== "phone" ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  if (step === "otp") setStep("phone");
                  else if (step === "staff_ack") setStep("otp");
                  else if (step === "category") {
                    setStep(existingStaffBrands.length > 0 ? "staff_ack" : "otp");
                  } else if (step === "shop") setStep("category");
                }}
                className="w-full py-2 text-sm font-semibold text-gray-500"
              >
                ← ย้อนกลับ
              </button>
            ) : null}
            <button
              type="button"
              disabled={loading}
              onClick={handlePrimaryAction}
              className={merchantButtonClass}
            >
              {loading
                ? "กำลังดำเนินการ…"
                : step === "phone"
                  ? "ส่งรหัส OTP"
                : step === "otp"
                  ? "ถัดไป"
                  : step === "staff_ack"
                    ? "ถัดไป"
                    : step === "category"
                      ? "ถัดไป"
                      : "เปิดร้านเลย"}
            </button>
          </div>
        ) : null}

        {registerMode === "self" && step === "phone" ? (
          <p className="mt-6 text-center text-sm text-gray-500">
            มีบัญชีแล้ว?{" "}
            <Link href="/owner/login" className="font-semibold text-site-primary">
              เข้าสู่ระบบ
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}

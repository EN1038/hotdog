"use client";

import { useEffect, useRef, useState } from "react";
import { OtpDigitInput, OTP_DIGIT_LENGTH } from "@/components/OtpDigitInput";
import {
  OwnerRegisterShell,
  RegisterCreateProgress,
  RegisterLoginFooter,
  RegisterModeSelector,
  RegisterPhoneField,
  RegisterOtpExpiredModal,
  RegisterPrimaryButton,
  RegisterProgressSteps,
  RegisterWizardBackButton,
  TrialBanner,
  IconLine,
  registerErrorClass,
  registerInputClass,
  registerLabelClass,
  registerOptionCardClass,
} from "@/components/owner/owner-register-ui";
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  formatOtpCountdown,
} from "@/lib/otp-ttl";
import {
  OWNER_REGISTER_IMPORT_OPTIONS,
  type OwnerRegisterImportLevel,
} from "@/lib/owner-register-shared";
import {
  PLATFORM_LINE_ADD_URL,
  PLATFORM_LINE_QR_SRC,
} from "@/lib/platform-support";

type RegisterMode = "self" | "line";

type Step = "phone" | "otp" | "category" | "shop" | "creating" | "done";

type RegisterCategory = {
  code: string;
  label: string;
  hint: string;
  offersMasterImport: boolean;
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

function progressStateForStep(
  step: Step,
): { activeIndex: number; completedThrough: number } {
  if (step === "phone") return { activeIndex: 0, completedThrough: -1 };
  if (step === "otp") return { activeIndex: 1, completedThrough: 0 };
  if (step === "category" || step === "shop") {
    return { activeIndex: 2, completedThrough: 1 };
  }
  if (step === "creating") return { activeIndex: 3, completedThrough: 2 };
  return { activeIndex: 3, completedThrough: 3 };
}

function isOtpSessionExpiredMessage(message: string) {
  return (
    message.includes("หมดอายุ") ||
    message.includes("ถูกใช้แล้ว") ||
    message.includes("ไม่พบคำขอรหัส OTP")
  );
}

export function OwnerRegisterWizard() {
  const [registerMode, setRegisterMode] = useState<RegisterMode>("self");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otpVerifiedChallengeId, setOtpVerifiedChallengeId] = useState("");
  const [otpRefNo, setOtpRefNo] = useState("");
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpResendIn, setOtpResendIn] = useState(0);
  const [shopCategory, setShopCategory] = useState("");
  const [registerCategories, setRegisterCategories] = useState<
    RegisterCategory[]
  >([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [shopName, setShopName] = useState("");
  const [importMaster, setImportMaster] =
    useState<OwnerRegisterImportLevel>("full");
  const [createStage, setCreateStage] = useState<CreateStage>("verify");
  const [error, setError] = useState("");
  const [otpExpiredModalOpen, setOtpExpiredModalOpen] = useState(false);
  const otpCountdownWasActiveRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [resultSummary, setResultSummary] = useState<{
    shopName: string;
    trialEndsAt: string;
    importSummary: {
      menuItems: number;
      categories: number;
    } | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/owner/register/categories", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          categories?: RegisterCategory[];
        };
        if (cancelled) return;
        const list = Array.isArray(data.categories) ? data.categories : [];
        setRegisterCategories(list);
        if (list[0]?.code) {
          setShopCategory((prev) => prev || list[0]!.code);
        }
      } catch {
        if (!cancelled) setRegisterCategories([]);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectedCategoryAllowsImport(code: string) {
    return (
      registerCategories.find((c) => c.code === code)?.offersMasterImport ??
      false
    );
  }

  useEffect(() => {
    if (step !== "otp" || otpSecondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setOtpSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, otpSecondsLeft]);

  useEffect(() => {
    if (step !== "otp" || otpResendIn <= 0) return;
    const id = window.setInterval(() => {
      setOtpResendIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, otpResendIn]);

  function handleOtpExpired() {
    setError("");
    setOtpCode("");
    setChallengeId("");
    setOtpVerifiedChallengeId("");
    setOtpRefNo("");
    setOtpSecondsLeft(0);
    setOtpResendIn(0);
    otpCountdownWasActiveRef.current = false;
    setStep("phone");
    setOtpExpiredModalOpen(true);
  }

  useEffect(() => {
    if (step !== "otp") {
      otpCountdownWasActiveRef.current = false;
      return;
    }
    if (otpVerifiedChallengeId && otpVerifiedChallengeId === challengeId) {
      otpCountdownWasActiveRef.current = false;
      return;
    }
    if (otpSecondsLeft > 0) {
      otpCountdownWasActiveRef.current = true;
      return;
    }
    if (otpCountdownWasActiveRef.current) {
      handleOtpExpired();
    }
    // Keep deps length stable (step + countdown only). Verified/challenge are
    // read from the render that fires when the countdown hits zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
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
      const data = (await res.json().catch(() => ({}))) as {
        challengeId?: string;
        otpRefNo?: string;
        expiresIn?: number;
        resendIn?: number;
        error?: string;
        redirect?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "ส่ง OTP ไม่สำเร็จ");
        return;
      }
      setChallengeId(data.challengeId ?? "");
      setOtpVerifiedChallengeId("");
      setOtpRefNo(data.otpRefNo ?? "");
      setOtpSecondsLeft(
        typeof data.expiresIn === "number" ? data.expiresIn : OTP_TTL_SECONDS,
      );
      setOtpResendIn(
        typeof data.resendIn === "number" && data.resendIn > 0
          ? data.resendIn
          : OTP_RESEND_COOLDOWN_SECONDS,
      );
      setOtpCode("");
      setOtpExpiredModalOpen(false);
      setStep("otp");
    } catch {
      setError("เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtpAndContinue() {
    if (otpSecondsLeft <= 0) {
      handleOtpExpired();
      return;
    }
    if (otpCode.trim().length < OTP_DIGIT_LENGTH) {
      setError("กรุณากรอกรหัส OTP");
      return;
    }
    if (!challengeId) {
      setError("กรุณาขอรหัส OTP ใหม่");
      return;
    }
    if (otpVerifiedChallengeId && otpVerifiedChallengeId === challengeId) {
      setError("");
      setStep("category");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          challengeId,
          otpCode: otpCode.trim(),
          purpose: "owner_register",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        const message = data.error ?? "ยืนยัน OTP ไม่สำเร็จ";
        if (isOtpSessionExpiredMessage(message)) {
          handleOtpExpired();
          return;
        }
        setError(message);
        return;
      }
      setOtpVerifiedChallengeId(challengeId);
      setStep("category");
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
    if (!challengeId || otpVerifiedChallengeId !== challengeId) {
      setError("กรุณายืนยันรหัส OTP ก่อน");
      setStep("otp");
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
          shopName: shopName.trim(),
          shopCategory,
          importMaster: selectedCategoryAllowsImport(shopCategory)
            ? importMaster
            : "none",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        clearInterval(stageTimer);
        const message = data.error ?? "สมัครไม่สำเร็จ";
        if (isOtpSessionExpiredMessage(message)) {
          handleOtpExpired();
          return;
        }
        setError(message);
        setStep("shop");
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
      void verifyOtpAndContinue();
      return;
    }
    if (step === "category") {
      if (!shopCategory || registerCategories.length === 0) {
        setError("กรุณาเลือกประเภทร้าน");
        return;
      }
      setError("");
      setStep("shop");
      return;
    }
    if (step === "shop") {
      void submitRegistration();
    }
  }

  function handleWizardBack() {
    setError("");
    if (step === "otp") setStep("phone");
    else if (step === "category") setStep("otp");
    else if (step === "shop") setStep("category");
  }

  const showWizardBack =
    registerMode === "self" &&
    step !== "phone" &&
    step !== "creating" &&
    step !== "done";

  const primaryLabel =
    step === "phone"
      ? "ส่งรหัส OTP"
      : step === "otp"
        ? "ยืนยัน OTP"
        : step === "category"
          ? "ถัดไป"
          : "เปิดร้านเลย";

  const primaryDisabled =
    loading ||
    (step === "phone" && phone.length < 9) ||
    (step === "otp" &&
      (otpCode.trim().length < OTP_DIGIT_LENGTH || otpSecondsLeft <= 0)) ||
    (step === "shop" && shopName.trim().length < 2);

  return (
    <OwnerRegisterShell
      backHref="/"
      hideBack={step !== "phone"}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {step !== "creating" && step !== "done" ? (
          <RegisterModeSelector
            mode={registerMode}
            onChange={(mode) => {
              setRegisterMode(mode);
              setError("");
            }}
          />
        ) : null}

        {registerMode === "line" && step !== "creating" && step !== "done" ? (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                แอดไลน์ แล้วแอดมินสมัครให้
              </h2>
              <p className="mt-1 text-base text-slate-600">
                ไม่ต้องกรอกฟอร์มเอง — ส่งชื่อร้านมาทาง LINE ทีมงานจะเปิดบัญชีให้
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5 text-center ring-1 ring-slate-200/80">
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
              <p className="mt-3 text-base font-medium text-slate-700">
                สแกน QR ด้วยแอป LINE
              </p>
            </div>

            <a
              href={PLATFORM_LINE_ADD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[3.75rem] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#06C755] px-4 text-base font-extrabold text-white shadow-sm transition-all duration-200 hover:brightness-105 hover:shadow-md active:scale-[0.99]"
            >
              <IconLine aria-hidden />
              เพิ่มเพื่อนใน LINE
            </a>

            <RegisterLoginFooter />
          </div>
        ) : null}

        {registerMode === "self" && step === "phone" ? <TrialBanner /> : null}

        {registerMode === "self" && step !== "creating" && step !== "done" ? (
          <RegisterProgressSteps {...progressStateForStep(step)} />
        ) : null}

        {registerMode === "self" && step === "phone" ? (
          <>
            <RegisterPhoneField
              value={phone}
              onChange={setPhone}
              autoFocus
            />
          </>
        ) : null}

        {registerMode === "self" && step === "otp" ? (
          <div className="mt-6">
            <p className="text-base text-slate-600">
              ส่งรหัสไปที่ {phone}
              {otpRefNo ? ` (Ref: ${otpRefNo})` : ""}
            </p>
            <label
              id="owner-register-otp-label"
              htmlFor="owner-register-otp"
              className={`${registerLabelClass} mt-4`}
            >
              รหัส OTP
            </label>
            <OtpDigitInput
              id="owner-register-otp"
              value={otpCode}
              onChange={setOtpCode}
              autoFocus
              className="mt-2"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p
                className={`text-sm ${
                  otpSecondsLeft <= 0 ? "text-red-600" : "text-slate-500"
                }`}
              >
                {otpSecondsLeft > 0
                  ? `หมดอายุใน ${formatOtpCountdown(otpSecondsLeft)}`
                  : "รหัสหมดอายุแล้ว"}
              </p>
              <button
                type="button"
                onClick={() => void sendOtp()}
                disabled={loading || otpResendIn > 0}
                className="shrink-0 text-sm font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
              >
                ขอรหัสใหม่
              </button>
            </div>
          </div>
        ) : null}

        {registerMode === "self" && step === "category" ? (
          <div className="mt-6 space-y-2">
            <p className={registerLabelClass}>ประเภทร้าน</p>
            {categoriesLoading ? (
              <p className="text-sm text-slate-500">กำลังโหลดประเภทร้าน…</p>
            ) : registerCategories.length === 0 ? (
              <div className="space-y-3">
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-100">
                  ยังไม่ได้ตั้งประเภทร้านสำหรับสมัคร — ติดต่อทีม SkillSale
                </p>
                <button
                  type="button"
                  className="text-base font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline"
                  onClick={() => {
                    setCategoriesLoading(true);
                    void fetch("/api/owner/register/categories", {
                      cache: "no-store",
                    })
                      .then((r) => r.json())
                      .then((data: { categories?: RegisterCategory[] }) => {
                        const list = Array.isArray(data.categories)
                          ? data.categories
                          : [];
                        setRegisterCategories(list);
                        if (list[0]?.code) setShopCategory(list[0].code);
                      })
                      .finally(() => setCategoriesLoading(false));
                  }}
                >
                  โหลดใหม่
                </button>
              </div>
            ) : (
              registerCategories.map((cat) => (
                <button
                  key={cat.code}
                  type="button"
                  onClick={() => setShopCategory(cat.code)}
                  className={registerOptionCardClass(shopCategory === cat.code)}
                >
                  <p className="text-base font-bold text-slate-900">{cat.label}</p>
                  {cat.hint ? (
                    <p className="mt-0.5 text-sm text-slate-500">{cat.hint}</p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        ) : null}

        {registerMode === "self" && step === "shop" ? (
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="owner-shop-name" className={registerLabelClass}>
                ชื่อร้าน
              </label>
              <input
                id="owner-shop-name"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="เช่น หม่าล่าบ้านสวน"
                className={registerInputClass}
                autoFocus
                maxLength={80}
              />
            </div>

            {selectedCategoryAllowsImport(shopCategory) ? (
              <div>
                <p className={registerLabelClass}>เมนูตั้งต้น</p>
                <div className="space-y-2">
                  {OWNER_REGISTER_IMPORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setImportMaster(opt.id)}
                      className={registerOptionCardClass(importMaster === opt.id)}
                    >
                      <p className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
                        <span>{opt.label}</span>
                        {opt.recommended ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold leading-none text-emerald-700 ring-1 ring-emerald-200/80">
                            แนะนำ
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">{opt.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200/80">
                ประเภทนี้เริ่มเมนูว่าง — เพิ่มรายการขายได้หลังเข้าระบบ
              </p>
            )}
          </div>
        ) : null}

        {step === "creating" || step === "done" ? (
          <div className="mt-2 space-y-4">
            <RegisterProgressSteps activeIndex={3} completedThrough={3} />
            <RegisterCreateProgress
              complete={step === "done"}
              stages={CREATE_STAGES}
              currentStageId={createStage}
              skipStageIds={
                !selectedCategoryAllowsImport(shopCategory) ||
                importMaster === "none"
                  ? ["import"]
                  : []
              }
              footer={
                resultSummary?.importSummary ? (
                  <>
                    นำเข้า {resultSummary.importSummary.menuItems} เมนู ·{" "}
                    {resultSummary.importSummary.categories} หมวด
                  </>
                ) : undefined
              }
            />
          </div>
        ) : null}

        {registerMode === "self" && error ? (
          <p className={registerErrorClass} role="alert">
            {error}
          </p>
        ) : null}

        {registerMode === "self" && step !== "creating" && step !== "done" ? (
          <div className="mt-auto space-y-3 pt-8">
            <RegisterPrimaryButton
              loading={loading}
              disabled={primaryDisabled}
              onClick={handlePrimaryAction}
            >
              {primaryLabel}
            </RegisterPrimaryButton>
            {showWizardBack ? (
              <RegisterWizardBackButton
                onClick={handleWizardBack}
                disabled={loading}
              />
            ) : null}
            {step === "phone" ? <RegisterLoginFooter /> : null}
          </div>
        ) : null}
      </div>
      <RegisterOtpExpiredModal
        open={otpExpiredModalOpen}
        onAcknowledge={() => setOtpExpiredModalOpen(false)}
      />
    </OwnerRegisterShell>
  );
}

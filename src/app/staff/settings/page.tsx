"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { logout } from "@/components/LoginForm";
import { AddToHomeScreenBanner } from "@/components/staff/AddToHomeScreenBanner";
import { PlatformSupportCard } from "@/components/PlatformSupportCard";
import { syncStaffBrandFromLogin } from "@/components/staff/StaffBrandingShell";

import {
  IconLogout,
  IconPrinter,
  IconVolume,
  IconVolumeOff,
} from "@/components/icons";
import {
  playOrderAlertSound,
  previewAlertSound,
  setOrderAlertSoundUrl,
  STAFF_SOUND_PREF_KEY,
  unlockOrderAlertSound,
} from "@/lib/staff-order-alert";
import {
  canReturnToOwnerFromStaff,
  returnToOwnerFromStaff,
} from "@/lib/owner-enter-staff";
import {
  formatPrinterLabel,
  getPrintBridgeStatus,
  selectPrinter,
} from "@/lib/print-bridge";

type AlertSoundOption = { id: string; name: string; fileUrl: string };

type BranchChoice = {
  branchId: string;
  branchName: string;
  brandName: string | null;
};

export default function StaffSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [alertSounds, setAlertSounds] = useState<AlertSoundOption[]>([]);
  const [selectedAlertSoundId, setSelectedAlertSoundId] = useState("");
  const [savingAlertSound, setSavingAlertSound] = useState(false);
  const [printBridgeReady, setPrintBridgeReady] = useState(false);
  const [printerConfigured, setPrinterConfigured] = useState(false);
  const [printerLabel, setPrinterLabel] = useState("ยังไม่เชื่อมเครื่องพิมพ์");
  const [branchChoices, setBranchChoices] = useState<BranchChoice[]>([]);
  const [canReturnOwner, setCanReturnOwner] = useState(false);
  const [returningOwner, setReturningOwner] = useState(false);
  const [currentBranchId, setCurrentBranchId] = useState("");
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState("");
  const [profilePhoneVerified, setProfilePhoneVerified] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/staff/orders");
    if (res.status === 401) {
      router.replace("/staff/login");
      return;
    }
    if (!res.ok) {
      setLoading(false);
      return;
    }
    await res.json();
    try {
      const br = await fetch("/api/staff/switch-branch");
      if (br.ok) {
        const data = (await br.json()) as {
          currentBranchId?: string;
          branches?: BranchChoice[];
        };
        setCurrentBranchId(data.currentBranchId ?? "");
        setBranchChoices(Array.isArray(data.branches) ? data.branches : []);
      }
    } catch {
      /* ignore */
    }
    try {
      const pr = await fetch("/api/staff/profile");
      if (pr.ok) {
        const data = (await pr.json()) as {
          name?: string;
          imageUrl?: string | null;
          phone?: string;
          phoneVerified?: boolean;
        };
        setProfileName(data.name ?? "");
        setProfileImageUrl(data.imageUrl ?? null);
        setProfilePhone(data.phone ?? "");
        setProfilePhoneVerified(Boolean(data.phoneVerified));
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void canReturnToOwnerFromStaff().then(setCanReturnOwner);
  }, []);

  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem(STAFF_SOUND_PREF_KEY) === "1");
    } catch {
      /* ignore */
    }
    fetch("/api/staff/alert-sound")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const list: AlertSoundOption[] = Array.isArray(data.alertSounds)
          ? data.alertSounds
          : [];
        setAlertSounds(list);
        const selectedId =
          typeof data.alertSoundId === "string" ? data.alertSoundId : "";
        setSelectedAlertSoundId(selectedId);
        const url =
          typeof data.alertSound?.fileUrl === "string"
            ? data.alertSound.fileUrl
            : (list.find((s) => s.id === selectedId)?.fileUrl ?? null);
        setOrderAlertSoundUrl(url);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refresh = () => {
      const status = getPrintBridgeStatus();
      setPrintBridgeReady(status.inApp);
      setPrinterConfigured(status.configured);
      if (status.inApp) setPrinterLabel(formatPrinterLabel(status.printer));
    };
    refresh();
    window.addEventListener("skillsale-print-ready", refresh);
    return () => window.removeEventListener("skillsale-print-ready", refresh);
  }, []);

  async function saveAlertSound(id: string) {
    setSavingAlertSound(true);
    try {
      const res = await fetch("/api/staff/alert-sound", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertSoundId: id || null }),
      });
      if (!res.ok) {
        toast.error("บันทึกเสียงไม่สำเร็จ");
        return;
      }
      setSelectedAlertSoundId(id);
      const url = id
        ? alertSounds.find((s) => s.id === id)?.fileUrl ?? null
        : null;
      setOrderAlertSoundUrl(url);
      toast.success("บันทึกเสียงแล้ว");
    } finally {
      setSavingAlertSound(false);
    }
  }

  async function saveProfile(next: { name?: string; imageUrl?: string | null }) {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/staff/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "บันทึกโปรไฟล์ไม่สำเร็จ");
        return false;
      }
      if (typeof data.name === "string") setProfileName(data.name);
      if ("imageUrl" in data) setProfileImageUrl(data.imageUrl ?? null);
      window.dispatchEvent(new Event("staff-branding-reload"));
      return true;
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
      return false;
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadProfilePhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "Staff");
      const res = await fetch("/api/staff/uploads", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "อัปโหลดรูปไม่สำเร็จ");
        return;
      }
      const url = typeof data.url === "string" ? data.url : "";
      if (!url) {
        toast.error("อัปโหลดรูปไม่สำเร็จ");
        return;
      }
      const ok = await saveProfile({ imageUrl: url });
      if (ok) toast.success("เปลี่ยนรูปแล้ว");
    } catch {
      toast.error("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function switchBranch(branchId: string) {
    if (branchId === currentBranchId || switchingBranch) return;
    setSwitchingBranch(true);
    try {
      const res = await fetch("/api/staff/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "สลับสาขาไม่สำเร็จ");
        return;
      }
      syncStaffBrandFromLogin(data.brand);
      toast.success(`สลับไปสาขา ${String(data.branchName ?? "").replace(/^สาขา\s*/, "")}`);
      window.location.assign("/staff");
    } finally {
      setSwitchingBranch(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState className="w-full max-w-sm" />
      </main>
    );
  }

  return (
    <StaffAppShell active="settings">
      <div className="space-y-4 px-4 py-4">
        <section
          id="profile"
          className="scroll-mt-4 rounded-2xl bg-white p-5 shadow-sm"
        >
          <h2 className="text-[17px] font-extrabold text-slate-900">
            โปรไฟล์พนักงาน
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            เปลี่ยนรูปและชื่อที่ใช้แสดงในแอป
          </p>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              disabled={uploadingPhoto || savingProfile}
              onClick={() => photoInputRef.current?.click()}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-2 ring-slate-200"
              aria-label="เปลี่ยนรูปโปรไฟล์"
            >
              {profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profileImageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl font-black text-slate-400">
                  {(profileName || profilePhone || "?").slice(0, 1)}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-[10px] font-bold text-white">
                {uploadingPhoto ? "…" : "เปลี่ยนรูป"}
              </span>
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadProfilePhoto(file);
              }}
            />
            <div className="min-w-0 flex-1">
              <label className="text-[12px] font-semibold text-slate-500">
                ชื่อที่แสดง
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] font-semibold text-slate-900"
                value={profileName}
                maxLength={80}
                placeholder="เช่น สมชาย"
                onChange={(e) => setProfileName(e.target.value)}
              />
              {profilePhone ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <p className="text-[12px] text-slate-400">{profilePhone}</p>
                  {profilePhoneVerified ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      ยืนยันเบอร์แล้ว
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      ยังไม่ยืนยันเบอร์
                    </span>
                  )}
                </div>
              ) : null}
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                เข้าใช้งานได้พร้อมกันสูงสุด 3 เครื่องต่อเบอร์
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={savingProfile || !profileName.trim()}
            onClick={async () => {
              const ok = await saveProfile({ name: profileName.trim() });
              if (ok) toast.success("บันทึกชื่อแล้ว");
            }}
            className="mt-4 w-full rounded-xl bg-site-primary px-4 py-3 text-[15px] font-extrabold text-white disabled:opacity-50"
          >
            {savingProfile ? "กำลังบันทึก…" : "บันทึกชื่อ"}
          </button>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-[17px] font-extrabold text-slate-900">
            บันทึกไอคอนลงมือถือ
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
            เพิ่ม SkillSale ไปหน้าจอหลัก แล้วเปิดได้เหมือนแอป
          </p>
          <div className="mt-3">
            <AddToHomeScreenBanner force className="" />
          </div>
        </section>

        {branchChoices.length > 1 ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-[17px] font-extrabold text-slate-900">
              สลับสาขา
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              เบอร์นี้ทำงานได้หลายสาขา — เลือกสาขาที่ต้องการทำงานตอนนี้
            </p>
            <ul className="mt-3 space-y-2">
              {branchChoices.map((b) => {
                const active = b.branchId === currentBranchId;
                return (
                  <li key={b.branchId}>
                    <button
                      type="button"
                      disabled={switchingBranch || active}
                      onClick={() => void switchBranch(b.branchId)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${
                        active
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-white text-slate-900 active:bg-slate-50"
                      } disabled:opacity-60`}
                    >
                      <span>
                        {b.branchName.replace(/^สาขา\s*/, "")}
                        {b.brandName ? (
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            {b.brandName}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        <span className="text-xs font-bold text-emerald-700">
                          ใช้งานอยู่
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">
                          สลับ
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-[17px] font-extrabold text-slate-900">
            โปรโมชั่น
          </h2>
          <p className="mt-1 text-[13px] font-medium text-slate-500">
            กำหนดวันหมดอายุโปรเลือกไม้ · หมดแล้วโชว์ที่หน้าร้านอีก 3 วัน
          </p>
          <Link
            href="/staff/settings/promos"
            className="mt-3 flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 text-[15px] font-bold text-slate-900 active:bg-slate-100"
          >
            <span>จัดการโปร / วันหมดอายุ</span>
            <span className="text-slate-400" aria-hidden>
              ›
            </span>
          </Link>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-[17px] font-extrabold text-slate-900">
            เสียงแจ้งเตือน
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {!soundOn ? (
              <button
                type="button"
                onClick={() => {
                  unlockOrderAlertSound();
                  try {
                    localStorage.setItem(STAFF_SOUND_PREF_KEY, "1");
                  } catch {
                    /* ignore */
                  }
                  setSoundOn(true);
                  playOrderAlertSound();
                }}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[15px] font-bold text-amber-950"
              >
                <IconVolumeOff size={20} /> เปิดเสียง
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(STAFF_SOUND_PREF_KEY, "0");
                  } catch {
                    /* ignore */
                  }
                  setSoundOn(false);
                }}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[15px] font-bold text-emerald-900"
              >
                <IconVolume size={20} /> ปิดเสียง
              </button>
            )}
          </div>
          <select
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3.5 text-[15px]"
            value={selectedAlertSoundId}
            disabled={savingAlertSound}
            onChange={(e) => void saveAlertSound(e.target.value)}
          >
            <option value="">บี๊บเริ่มต้น</option>
            {alertSounds.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mt-3 text-[13px] font-bold text-site-primary underline"
            onClick={() => {
              const url = selectedAlertSoundId
                ? alertSounds.find((s) => s.id === selectedAlertSoundId)
                    ?.fileUrl
                : null;
              if (url) previewAlertSound(url);
              else playOrderAlertSound();
            }}
          >
            ลองฟัง
          </button>
        </section>

        {printBridgeReady ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-[17px] font-extrabold text-slate-900">
              เครื่องพิมพ์
            </h2>
            <p className="mt-1.5 text-[13px] text-slate-500">{printerLabel}</p>
            <button
              type="button"
              onClick={() => selectPrinter()}
              className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border py-3.5 text-[15px] font-extrabold ${
                printerConfigured
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              <IconPrinter size={20} />
              {printerConfigured ? "เปลี่ยนเครื่องพิมพ์" : "เชื่อมเครื่องพิมพ์"}
            </button>
          </section>
        ) : null}

        <PlatformSupportCard />

        {canReturnOwner ? (
          <button
            type="button"
            disabled={returningOwner}
            onClick={() => {
              void (async () => {
                setReturningOwner(true);
                const result = await returnToOwnerFromStaff();
                if (!result.ok) {
                  toast.error("ไปบัญชีร้านไม่สำเร็จ", result.error);
                  setReturningOwner(false);
                  return;
                }
                window.location.assign("/owner");
              })();
            }}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-[15px] font-extrabold text-white shadow-sm disabled:opacity-60"
          >
            {returningOwner ? "กำลังไป…" : "บัญชีร้าน / แพ็กเกจ"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => logout("/staff/login")}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-4 text-[15px] font-extrabold text-slate-700 shadow-sm"
        >
          <IconLogout size={20} /> ออกจากระบบ
        </button>
      </div>
    </StaffAppShell>
  );
}

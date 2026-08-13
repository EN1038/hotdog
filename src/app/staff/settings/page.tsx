"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [currentBranchId, setCurrentBranchId] = useState("");
  const [switchingBranch, setSwitchingBranch] = useState(false);

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
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

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

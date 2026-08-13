"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { logout } from "@/components/LoginForm";
import { AddToHomeScreenBanner } from "@/components/staff/AddToHomeScreenBanner";
import { PlatformSupportCard } from "@/components/PlatformSupportCard";

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

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/components/admin/Toast";
import { logout } from "@/components/LoginForm";
import {
  StaffShiftControls,
  type ActiveShiftInfo,
} from "@/components/staff/StaffShiftControls";
import { StaffShiftSummarySheet } from "@/components/staff/StaffShiftSummarySheet";
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
  const [canToggleStore, setCanToggleStore] = useState(false);
  const [canSell, setCanSell] = useState(false);
  const [activeShift, setActiveShift] = useState<ActiveShiftInfo | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [operatingDay, setOperatingDay] = useState("");
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
    const data = await res.json();
    setCanToggleStore(Boolean(data.canToggleStore));
    setCanSell(Boolean(data.canSell));
    setActiveShift(data.activeShift ?? null);
    setOperatingDay(data.operatingDay ?? "");
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
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">รอบขาย / เปิด–ปิด</h2>
          <div className="mt-3">
            <StaffShiftControls
              canToggleStore={canToggleStore}
              canSell={canSell}
              activeShift={activeShift}
              onOpened={() => {
                toast.success("เปิดรอบแล้ว");
                void load();
              }}
              onClosed={(msg) => {
                toast.success("ปิดรอบแล้ว", msg);
                void load();
              }}
              onError={(title, detail) => toast.error(title, detail)}
            />
          </div>
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-bold text-slate-800"
          >
            ดูสรุปยอด
          </button>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">เสียงแจ้งเตือน</h2>
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
                className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
              >
                <IconVolumeOff size={18} /> เปิดเสียง
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
                className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"
              >
                <IconVolume size={18} /> ปิดเสียง
              </button>
            )}
          </div>
          <select
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
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
            className="mt-2 text-xs font-semibold text-slate-600 underline"
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
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">เครื่องพิมพ์</h2>
            <p className="mt-1 text-xs text-slate-500">{printerLabel}</p>
            <button
              type="button"
              onClick={() => selectPrinter()}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold ${
                printerConfigured
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              <IconPrinter size={18} />
              {printerConfigured ? "เปลี่ยนเครื่องพิมพ์" : "เชื่อมเครื่องพิมพ์"}
            </button>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => logout("/staff/login")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 shadow-sm"
        >
          <IconLogout size={18} /> ออกจากระบบ
        </button>
      </div>

      <StaffShiftSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        initialDate={operatingDay}
      />
    </StaffAppShell>
  );
}

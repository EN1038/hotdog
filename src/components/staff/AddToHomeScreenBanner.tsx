"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "skillsale_a2hs_dismissed_v1";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    );
  return mq || iosStandalone;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isMobileLike(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isIosDevice()) return true;
  if (/Android/i.test(navigator.userAgent)) return true;
  return window.matchMedia("(max-width: 820px)").matches;
}

/**
 * Soft prompt / install help so แม่ค้า can pin SkillSale to the home screen
 * and open it like an app (standalone, no browser bar).
 *
 * - Android Chrome: "เพิ่มเลย" when browser fires beforeinstallprompt
 * - iPhone Safari: Share → เพิ่มไปยังหน้าจอโฮม
 * - Settings page: pass `force` to always show (ignores dismiss)
 */
export function AddToHomeScreenBanner({
  force = false,
  className = "mx-4 mt-3",
}: {
  force?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(force);
  const [iosHint, setIosHint] = useState(false);
  const [androidHint, setAndroidHint] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setInstalled(true);
      setVisible(force);
      return;
    }

    if (!force) {
      try {
        if (localStorage.getItem(DISMISS_KEY) === "1") return;
      } catch {
        /* ignore */
      }
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
      setIosHint(false);
      setAndroidHint(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const t = window.setTimeout(() => {
      if (isStandaloneDisplay()) return;
      if (!isMobileLike() && !force) return;
      setVisible(true);
      if (isIosDevice()) {
        setIosHint(true);
        setAndroidHint(false);
      } else {
        setIosHint(false);
        setAndroidHint(true);
      }
    }, force ? 0 : 1800);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearTimeout(t);
    };
  }, [force]);

  if (installed && force) {
    return (
      <div
        className={`rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 ${className}`}
      >
        <p className="text-sm font-bold text-emerald-900">
          เปิดแบบแอปอยู่แล้ว
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
          คุณเปิดจากไอคอนหน้าจอหลักแล้ว — ไม่มีแถบเบราว์เซอร์
        </p>
      </div>
    );
  }

  if (!visible || installed) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    dismiss();
  }

  function dismiss() {
    if (force) return;
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function clearDismissAndShow() {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* ignore */
    }
    setVisible(true);
  }

  return (
    <div
      className={`rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ea580c] text-lg font-black text-white shadow-sm">
          S
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">
            บันทึกไอคอนลงมือถือ — ใช้เหมือนแอป
          </p>
          {iosHint ? (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
              <li>
                กดปุ่ม <span className="font-semibold">แชร์</span>{" "}
                (สี่เหลี่ยมมีลูกศร) ที่แถบล่าง Safari
              </li>
              <li>
                เลื่อนหา{" "}
                <span className="font-semibold">เพิ่มไปยังหน้าจอโฮม</span>
              </li>
              <li>
                กด <span className="font-semibold">เพิ่ม</span>
              </li>
            </ol>
          ) : androidHint && !deferred ? (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
              <li>
                กดเมนู <span className="font-semibold">⋮</span> มุมบน Chrome
              </li>
              <li>
                เลือก{" "}
                <span className="font-semibold">
                  ติดตั้งแอป
                </span>{" "}
                หรือ{" "}
                <span className="font-semibold">เพิ่มไปยังหน้าจอหลัก</span>
              </li>
              <li>เปิดจากไอคอน SkillSale ได้เลย</li>
            </ol>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              เปิดจากไอคอนบนมือถือได้เลย ไม่ต้องพิมพ์ลิงก์ทุกครั้ง
              และไม่มีแถบเบราว์เซอร์
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {deferred ? (
              <button
                type="button"
                onClick={() => void install()}
                className="min-h-12 rounded-xl bg-[#ea580c] px-4 text-sm font-bold text-white"
              >
                บันทึกไอคอนเลย
              </button>
            ) : null}
            {!force ? (
              <button
                type="button"
                onClick={dismiss}
                className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
              >
                ไว้ทีหลัง
              </button>
            ) : !deferred ? (
              <button
                type="button"
                onClick={clearDismissAndShow}
                className="min-h-12 rounded-xl border border-orange-200 bg-white px-4 text-sm font-semibold text-orange-700"
              >
                ดูวิธีอีกครั้ง
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

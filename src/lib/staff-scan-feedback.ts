/** Scan / package feedback: beep + Thai spoken name.
 * Browser: Web Audio + speechSynthesis.
 * SkillSale Print APK: native ToneGenerator + TextToSpeech via Android bridge
 * (Web Audio/TTS in WebView breaks the print bridge).
 */

import { hasPrintBridge } from "@/lib/print-bridge";

let sharedCtx: AudioContext | null = null;
let preferredThaiVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;

function getNativeScanBridge(): {
  playScanSuccess?: (spokenLabel?: string | null) => void;
  playScanError?: (spokenLabel?: string | null) => void;
  unlockScanFeedback?: () => void;
} | null {
  if (typeof window === "undefined") return null;
  const bridge = window.Android;
  if (!bridge) return null;
  if (
    typeof bridge.playScanSuccess !== "function" &&
    typeof bridge.playScanError !== "function"
  ) {
    return null;
  }
  return bridge;
}

/** Print WebView without native scan APIs — never use Web Audio/TTS there. */
function mustSkipWebAudio(): boolean {
  if (getNativeScanBridge()) return false;
  return hasPrintBridge();
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || mustSkipWebAudio()) return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

function beep(
  ctx: AudioContext,
  startAt: number,
  frequency: number,
  duration: number,
  peak = 0.22,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.04);
}

function refreshThaiVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (mustSkipWebAudio()) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;
  voicesReady = true;
  preferredThaiVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith("th")) ??
    voices.find((v) => /thai/i.test(v.name)) ??
    null;
}

function ensureVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (mustSkipWebAudio()) return;
  refreshThaiVoice();
  if (!voicesReady) {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => refreshThaiVoice(),
      { once: true },
    );
  }
}

function speakThai(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (mustSkipWebAudio()) return;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return;

  ensureVoices();
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }

  const utter = new SpeechSynthesisUtterance(cleaned);
  utter.lang = preferredThaiVoice?.lang || "th-TH";
  if (preferredThaiVoice) utter.voice = preferredThaiVoice;
  utter.rate = 1.05;
  utter.pitch = 1;
  utter.volume = 1;
  window.speechSynthesis.speak(utter);
}

function withRunningContext(play: (ctx: AudioContext) => void): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => {
        if (ctx.state === "running") play(ctx);
      });
      return;
    }
    if (ctx.state === "running") play(ctx);
  } catch {
    /* ignore — never break scan/print flows */
  }
}

function playSuccessBeep() {
  withRunningContext((ctx) => {
    const t = ctx.currentTime;
    beep(ctx, t, 980, 0.07, 0.16);
    beep(ctx, t + 0.08, 1310, 0.09, 0.18);
  });
}

function playErrorBeep() {
  withRunningContext((ctx) => {
    const t = ctx.currentTime;
    beep(ctx, t, 320, 0.12, 0.22);
    beep(ctx, t + 0.13, 220, 0.15, 0.18);
  });
}

/** Call from a click / scan gesture so browser audio + speech are allowed. */
export async function unlockScanFeedbackSound(): Promise<void> {
  const native = getNativeScanBridge();
  if (native) {
    try {
      native.unlockScanFeedback?.();
    } catch {
      /* ignore */
    }
    return;
  }
  if (mustSkipWebAudio()) return;

  try {
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    ensureVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        // iOS often needs a speak() inside a user gesture to unlock TTS.
        const warm = new SpeechSynthesisUtterance(" ");
        warm.volume = 0;
        warm.rate = 2;
        window.speechSynthesis.speak(warm);
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Found item / save ok.
 * Pass a Thai label (product name) to speak it after a short chirp.
 */
export function playScanSuccessSound(spokenLabel?: string | null): void {
  const native = getNativeScanBridge();
  if (native?.playScanSuccess) {
    try {
      native.playScanSuccess(spokenLabel?.trim() || "");
    } catch {
      /* ignore */
    }
    return;
  }
  if (mustSkipWebAudio()) return;
  try {
    playSuccessBeep();
    const label = spokenLabel?.trim();
    if (label) {
      window.setTimeout(() => speakThai(label), 120);
    }
  } catch {
    /* ignore */
  }
}

/** Not found / failed — optional spoken reason */
export function playScanErrorSound(spokenLabel?: string | null): void {
  const native = getNativeScanBridge();
  if (native?.playScanError) {
    try {
      native.playScanError(spokenLabel?.trim() || "ไม่พบรายการ");
    } catch {
      /* ignore */
    }
    return;
  }
  if (mustSkipWebAudio()) return;
  try {
    playErrorBeep();
    const label = spokenLabel?.trim() || "ไม่พบรายการ";
    window.setTimeout(() => speakThai(label), 80);
  } catch {
    /* ignore */
  }
}

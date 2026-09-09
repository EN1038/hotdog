/** Scan / package feedback: beep + Thai spoken name.
 * - Browser: Web Audio + speechSynthesis
 * - SkillSale Print APK 1.3.0+: native ToneGenerator + TextToSpeech
 * - Older Print APK: HTML5 Audio beep only (no Web Audio / speechSynthesis —
 *   those break the Bluetooth print bridge)
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

function inPrintWebView(): boolean {
  return hasPrintBridge();
}

/** Prefer HTML Audio / native — never Web Audio or speechSynthesis in Print WebView. */
function mustSkipWebSpeechAndAudioContext(): boolean {
  return inPrintWebView();
}

function vibrateFeedback(kind: "success" | "error"): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(kind === "success" ? [40, 30, 60] : [120, 40, 120]);
  } catch {
    /* ignore */
  }
}

/** Build a short PCM WAV beep in-memory (no Web Audio API). */
function playGeneratedBeep(kind: "success" | "error"): void {
  try {
    const sampleRate = 22050;
    const tones =
      kind === "success"
        ? [
            { freq: 980, start: 0, dur: 0.07 },
            { freq: 1310, start: 0.08, dur: 0.09 },
          ]
        : [
            { freq: 320, start: 0, dur: 0.12 },
            { freq: 220, start: 0.13, dur: 0.15 },
          ];
    const totalSec = kind === "success" ? 0.22 : 0.32;
    const numSamples = Math.ceil(sampleRate * totalSec);
    const data = new Int16Array(numSamples);
    for (const tone of tones) {
      const start = Math.floor(tone.start * sampleRate);
      const len = Math.floor(tone.dur * sampleRate);
      for (let i = 0; i < len; i++) {
        const idx = start + i;
        if (idx >= numSamples) break;
        const t = i / sampleRate;
        const env = Math.min(1, i / 200) * Math.min(1, (len - i) / 400);
        const sample = Math.sin(2 * Math.PI * tone.freq * t) * env * 0.35;
        data[idx] = Math.max(
          -32767,
          Math.min(32767, Math.floor(sample * 32767)),
        );
      }
    }
    const buffer = new ArrayBuffer(44 + data.length * 2);
    const view = new DataView(buffer);
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + data.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++) {
      view.setInt16(44 + i * 2, data[i]!, true);
    }
    const blob = new Blob([buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    void audio.play().finally(() => {
      URL.revokeObjectURL(url);
    });
  } catch {
    /* ignore */
  }
}

function playPrintAppBeep(kind: "success" | "error"): void {
  playGeneratedBeep(kind);
  vibrateFeedback(kind);
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || mustSkipWebSpeechAndAudioContext()) {
    return null;
  }
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
  if (mustSkipWebSpeechAndAudioContext()) return;
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
  if (mustSkipWebSpeechAndAudioContext()) return;
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
  if (mustSkipWebSpeechAndAudioContext()) return;
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
    /* ignore */
  }
}

function playSuccessBeepWeb() {
  withRunningContext((ctx) => {
    const t = ctx.currentTime;
    beep(ctx, t, 980, 0.07, 0.16);
    beep(ctx, t + 0.08, 1310, 0.09, 0.18);
  });
}

function playErrorBeepWeb() {
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

  if (inPrintWebView()) {
    // Gesture unlock for HTMLAudioElement — silent warm-up.
    try {
      const silent = new Audio(
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
      );
      silent.volume = 0.001;
      await silent.play();
      silent.pause();
    } catch {
      /* ignore */
    }
    return;
  }

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

  try {
    if (inPrintWebView()) {
      playPrintAppBeep("success");
      return;
    }
    playSuccessBeepWeb();
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

  try {
    if (inPrintWebView()) {
      playPrintAppBeep("error");
      return;
    }
    playErrorBeepWeb();
    const label = spokenLabel?.trim() || "ไม่พบรายการ";
    window.setTimeout(() => speakThai(label), 80);
  } catch {
    /* ignore */
  }
}

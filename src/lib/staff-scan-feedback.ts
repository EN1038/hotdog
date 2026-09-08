/** Scan / package feedback: short beep + Thai spoken name via Web Speech API. */

let sharedCtx: AudioContext | null = null;
let preferredThaiVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
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
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      if (ctx.state === "running") play(ctx);
    });
    return;
  }
  if (ctx.state === "running") play(ctx);
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

/** Call from a click / scan gesture so audio + speech are allowed. */
export async function unlockScanFeedbackSound(): Promise<void> {
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
}

/**
 * Found item / save ok.
 * Pass a Thai label (product name) to speak it after a short chirp.
 */
export function playScanSuccessSound(spokenLabel?: string | null): void {
  playSuccessBeep();
  const label = spokenLabel?.trim();
  if (label) {
    // Slight delay so the chirp is heard before speech starts.
    window.setTimeout(() => speakThai(label), 120);
  }
}

/** Not found / failed — optional spoken reason */
export function playScanErrorSound(spokenLabel?: string | null): void {
  playErrorBeep();
  const label = spokenLabel?.trim() || "ไม่พบรายการ";
  window.setTimeout(() => speakThai(label), 80);
}

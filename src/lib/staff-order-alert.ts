/** Browser autoplay: AudioContext / Audio must start after a user gesture. */

let sharedCtx: AudioContext | null = null;
let alertSoundUrl: string | null = null;
let sharedAudio: HTMLAudioElement | null = null;

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
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function playBeepFallback(): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  beep(ctx, t, 880, 0.18);
  beep(ctx, t + 0.22, 1175, 0.22);
  beep(ctx, t + 0.5, 880, 0.18);
}

/** Set the branch-selected alert MP3 URL (or null for beep fallback). */
export function setOrderAlertSoundUrl(url: string | null | undefined): void {
  const next = url?.trim() || null;
  if (alertSoundUrl === next) return;
  alertSoundUrl = next;
  if (sharedAudio) {
    try {
      sharedAudio.pause();
    } catch {
      /* ignore */
    }
    sharedAudio = null;
  }
}

export function getOrderAlertSoundUrl(): string | null {
  return alertSoundUrl;
}

/** Unlock audio (call from click). Returns true if ready. */
export async function unlockOrderAlertSound(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  // Short silent blip so some browsers latch the gesture.
  const gain = ctx.createGain();
  gain.gain.value = 0.001;
  const osc = ctx.createOscillator();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);

  if (alertSoundUrl) {
    try {
      if (!sharedAudio) {
        sharedAudio = new Audio();
      }
      if (sharedAudio.getAttribute("data-url") !== alertSoundUrl) {
        sharedAudio.src = alertSoundUrl;
        sharedAudio.setAttribute("data-url", alertSoundUrl);
      }
      sharedAudio.muted = true;
      await sharedAudio.play();
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
      sharedAudio.muted = false;
    } catch {
      /* unlock best-effort */
    }
  }
  return ctx.state === "running";
}

export function playOrderAlertSound(): void {
  if (alertSoundUrl) {
    try {
      if (!sharedAudio) {
        sharedAudio = new Audio();
      }
      if (sharedAudio.getAttribute("data-url") !== alertSoundUrl) {
        sharedAudio.src = alertSoundUrl;
        sharedAudio.setAttribute("data-url", alertSoundUrl);
      }
      sharedAudio.currentTime = 0;
      const p = sharedAudio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => playBeepFallback());
      }
      return;
    } catch {
      playBeepFallback();
      return;
    }
  }
  playBeepFallback();
}

/** Preview a specific URL (does not change branch selection). */
export function previewAlertSound(url: string): void {
  try {
    const audio = new Audio(url);
    void audio.play().catch(() => {
      /* ignore */
    });
  } catch {
    /* ignore */
  }
}

export function vibrateForNewOrder(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([200, 80, 200, 80, 320]);
    } catch {
      /* ignore */
    }
  }
}

export const STAFF_SOUND_PREF_KEY = "staff-order-sound-enabled";

/** Browser autoplay: AudioContext must start after a user gesture. */

let sharedCtx: AudioContext | null = null;

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
  return ctx.state === "running";
}

export function playOrderAlertSound(): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  beep(ctx, t, 880, 0.18);
  beep(ctx, t + 0.22, 1175, 0.22);
  beep(ctx, t + 0.5, 880, 0.18);
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

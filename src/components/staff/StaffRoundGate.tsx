"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/LoadingState";
import { StaffOperatingRoundBanner } from "@/components/staff/StaffOperatingRoundBanner";

export type StaffRoundGateState = {
  operatingDay: string;
  canEnter: boolean;
  entryLocked: boolean;
  canSell: boolean;
  activeShift: {
    id: string;
    roundNumber: number;
    openedAt: string;
    openingCash: number;
  } | null;
};

/**
 * Loads round/shift status from /api/staff/branding.
 * Redirects to /staff when there is no open sales shift.
 */
export function useStaffRoundGate() {
  const router = useRouter();
  const [state, setState] = useState<StaffRoundGateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000);

    (async () => {
      try {
        const res = await fetch("/api/staff/branding", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/staff/login");
          return;
        }
        const data = await res.json().catch(() => ({}));
        const canSell = data.canSell !== false && data.canEnter !== false;
        const active =
          data.activeShift && typeof data.activeShift === "object"
            ? {
                id: String(data.activeShift.id ?? ""),
                roundNumber: Number(data.activeShift.roundNumber ?? 0),
                openedAt: String(data.activeShift.openedAt ?? ""),
                openingCash: Number(data.activeShift.openingCash ?? 0),
              }
            : null;
        const next: StaffRoundGateState = {
          operatingDay:
            typeof data.operatingDay === "string" ? data.operatingDay : "",
          canEnter: canSell,
          entryLocked: !canSell,
          canSell,
          activeShift: active?.id ? active : null,
        };
        if (!next.canSell) {
          setBlocked(true);
          router.replace("/staff");
          return;
        }
        setState(next);
      } catch {
        if (!cancelled) {
          // Fall back to staff home rather than infinite spinner
          setBlocked(true);
          router.replace("/staff");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  return { state, loading, blocked };
}

export function StaffRoundGateLoading({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <LoadingState className="w-full max-w-sm" label={label} />
    </main>
  );
}

export function StaffRoundStatusStrip({
  state,
}: {
  state: StaffRoundGateState;
}) {
  return (
    <StaffOperatingRoundBanner
      compact
      operatingDay={state.operatingDay}
      canSell={state.canSell}
      activeShift={state.activeShift}
    />
  );
}

export function StaffRoundGateShell({
  loadingLabel,
  children,
}: {
  loadingLabel: string;
  children: (state: StaffRoundGateState) => ReactNode;
}) {
  const { state, loading, blocked } = useStaffRoundGate();
  if (blocked || loading || !state) {
    return <StaffRoundGateLoading label={loadingLabel} />;
  }
  return <>{children(state)}</>;
}

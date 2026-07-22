"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/LoadingState";
import { StaffOperatingRoundBanner } from "@/components/staff/StaffOperatingRoundBanner";

export type StaffRoundGateState = {
  operatingDay: string;
  businessDayCutoffTime: string;
  lateEntryUntilTime: string | null;
  canEnter: boolean;
  entryLocked: boolean;
};

/**
 * Loads round status from /api/staff/branding.
 * Redirects to /staff when entry is locked.
 */
export function useStaffRoundGate() {
  const router = useRouter();
  const [state, setState] = useState<StaffRoundGateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/staff/branding");
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const next: StaffRoundGateState = {
        operatingDay:
          typeof data.operatingDay === "string" ? data.operatingDay : "",
        businessDayCutoffTime:
          typeof data.businessDayCutoffTime === "string"
            ? data.businessDayCutoffTime
            : "00:00",
        lateEntryUntilTime:
          typeof data.lateEntryUntilTime === "string"
            ? data.lateEntryUntilTime
            : null,
        canEnter: data.canEnter !== false,
        entryLocked: Boolean(data.entryLocked),
      };
      if (next.entryLocked || !next.canEnter) {
        setBlocked(true);
        router.replace("/staff");
        return;
      }
      setState(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
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
      businessDayCutoffTime={state.businessDayCutoffTime}
      lateEntryUntilTime={state.lateEntryUntilTime}
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

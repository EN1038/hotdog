"use client";

import { useEffect } from "react";

/** Poll while enabled; also refresh when the tab becomes visible again. */
export function usePollingRefresh(
  refresh: () => void | Promise<void>,
  {
    enabled,
    intervalMs = 10_000,
  }: {
    enabled: boolean;
    intervalMs?: number;
  },
) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, refresh]);
}

"use client";

import { useEffect } from "react";

const RELOAD_KEY = "skillsale_chunk_reload_v1";

function isChunkLoadFailure(value: unknown): boolean {
  if (!value) return false;
  const message =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : typeof value === "object" &&
            value !== null &&
            "message" in value &&
            typeof (value as { message: unknown }).message === "string"
          ? (value as { message: string }).message
          : String(value);

  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

/**
 * After a deploy, old tabs may request stale /_next/static chunks (404).
 * Reload once automatically so customers land on the fresh build.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const clearSoon = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        // ignore
      }
    }, 15_000);

    const reloadOnce = () => {
      try {
        if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
        sessionStorage.setItem(RELOAD_KEY, "1");
      } catch {
        // If storage is blocked, still try a single hard reload.
      }
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadFailure(event.error) || isChunkLoadFailure(event.message)) {
        reloadOnce();
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) {
        reloadOnce();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.clearTimeout(clearSoon);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

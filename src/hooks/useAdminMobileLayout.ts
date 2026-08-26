"use client";

import { useEffect, useState } from "react";
import {
  OWNER_VIEW_DESKTOP_MIN_PX,
  OWNER_VIEW_PREFERENCE_EVENT,
  resolveOwnerView,
  type OwnerViewMode,
} from "@/lib/owner-view-preference";

type LayoutState = {
  mode: OwnerViewMode;
  wideViewport: boolean;
};

function readLayoutState(): LayoutState {
  if (typeof window === "undefined") {
    return { mode: "mobile", wideViewport: false };
  }
  return {
    mode: resolveOwnerView(),
    wideViewport: window.matchMedia(
      `(min-width: ${OWNER_VIEW_DESKTOP_MIN_PX}px)`,
    ).matches,
  };
}

/** Admin branch pages — honour owner view preference (มุมมอง · มือถือ) + viewport. */
export function useAdminMobileLayout() {
  const [state, setState] = useState<LayoutState>(() => readLayoutState());

  useEffect(() => {
    const sync = () => setState(readLayoutState());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(OWNER_VIEW_PREFERENCE_EVENT, sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(OWNER_VIEW_PREFERENCE_EVENT, sync);
    };
  }, []);

  const isMobileLayout = state.mode === "mobile";

  return {
    isMobileLayout,
    /** User picked mobile on a wide screen — constrain width like a phone. */
    phoneFrame: isMobileLayout && state.wideViewport,
  };
}

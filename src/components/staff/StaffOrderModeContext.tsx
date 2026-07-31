"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readStaffOrderMode,
  writeStaffOrderMode,
  type StaffOrderMode,
} from "@/lib/staff-order-mode";

type Ctx = {
  mode: StaffOrderMode;
  setMode: (mode: StaffOrderMode) => void;
  toggleMode: () => void;
  isInstant: boolean;
};

const StaffOrderModeContext = createContext<Ctx | null>(null);

export function StaffOrderModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<StaffOrderMode>("instant");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setModeState(readStaffOrderMode());
    setReady(true);
  }, []);

  const setMode = useCallback((next: StaffOrderMode) => {
    setModeState(next);
    writeStaffOrderMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: StaffOrderMode = prev === "instant" ? "normal" : "instant";
      writeStaffOrderMode(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      mode: ready ? mode : "instant",
      setMode,
      toggleMode,
      isInstant: !ready || mode === "instant",
    }),
    [mode, ready, setMode, toggleMode],
  );

  return (
    <StaffOrderModeContext.Provider value={value}>
      {children}
    </StaffOrderModeContext.Provider>
  );
}

export function useStaffOrderMode() {
  const ctx = useContext(StaffOrderModeContext);
  if (!ctx) {
    const mode = readStaffOrderMode();
    return {
      mode,
      setMode: (next: StaffOrderMode) => writeStaffOrderMode(next),
      toggleMode: () => {
        const next: StaffOrderMode =
          readStaffOrderMode() === "instant" ? "normal" : "instant";
        writeStaffOrderMode(next);
      },
      isInstant: mode === "instant",
    };
  }
  return ctx;
}

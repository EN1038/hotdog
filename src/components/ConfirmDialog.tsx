"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconClose } from "@/components/icons";
import {
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";

type ConfirmTone = "danger" | "primary";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const titleId = useId();
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    confirmBtnRef.current?.focus();

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pending, close]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  const tone = pending?.tone ?? "danger";
  const confirmClass =
    tone === "primary"
      ? btnPrimary
      : "cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700";


  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="ปิด"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => close(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-red-50 via-white to-orange-50 px-5 py-4">
              <div>
                <h3
                  id={titleId}
                  className="text-base font-semibold text-gray-900"
                >
                  {pending.title}
                </h3>
                {pending.message && (
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">
                    {pending.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-white/80"
                aria-label="ปิด"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2 bg-gray-50 px-5 py-4">
              <button
                type="button"
                onClick={() => close(false)}
                className={btnOutline}
              >
                {pending.cancelLabel ?? "ยกเลิก"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => close(true)}
                className={confirmClass}
              >
                {pending.confirmLabel ?? "ตกลง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}

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
  adminInputClass,
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
  /** When set, user must type this exact text (trimmed) to enable confirm. */
  confirmText?: string;
  confirmTextHint?: string;
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
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const inputId = useId();
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setTyped("");
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
    setTyped("");
  }, []);

  const requiredText = pending?.confirmText?.trim() ?? "";
  const needsTypedMatch = Boolean(requiredText);
  const typedMatches =
    !needsTypedMatch || typed.trim() === requiredText;
  const typedMatchesRef = useRef(typedMatches);
  typedMatchesRef.current = typedMatches;

  useEffect(() => {
    if (!pending) return;

    let ready = false;
    const readyTimer = window.setTimeout(() => {
      ready = true;
    }, 200);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }
      // Ignore Enter until after open — same keypress that opened the dialog
      // would otherwise auto-confirm instantly.
      if (e.key === "Enter" && ready) {
        e.preventDefault();
        if (typedMatchesRef.current) close(true);
      }
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    if (needsTypedMatch) {
      inputRef.current?.focus();
    } else {
      confirmBtnRef.current?.focus();
    }

    return () => {
      window.clearTimeout(readyTimer);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pending, close, needsTypedMatch]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  const tone = pending?.tone ?? "danger";
  const confirmClass =
    tone === "primary"
      ? btnPrimary
      : "cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 disabled:shadow-none";

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
              <div className="min-w-0 flex-1">
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
                {needsTypedMatch ? (
                  <div className="mt-3">
                    <label
                      htmlFor={inputId}
                      className="block text-sm font-medium text-slate-700"
                    >
                      {pending.confirmTextHint ??
                        `พิมพ์ชื่อแบรนด์ «${requiredText}» เพื่อยืนยัน`}
                    </label>
                    <input
                      ref={inputRef}
                      id={inputId}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      className={`${adminInputClass} mt-1.5`}
                      placeholder={requiredText}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                    />
                  </div>
                ) : null}
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
                disabled={!typedMatches}
                onClick={() => {
                  if (!typedMatches) return;
                  close(true);
                }}
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

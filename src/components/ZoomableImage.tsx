"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ZoomableImage({
  src,
  alt = "รูป",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="ดูรูปเต็ม"
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[90dvh] max-w-[min(100%,42rem)] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/95 px-3 py-1.5 text-sm font-bold text-slate-800 shadow"
            >
              ปิด
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="block max-w-full cursor-zoom-in rounded-xl text-left"
        aria-label="ดูรูปเต็ม"
        title="กดเพื่อดูรูปเต็ม"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} />
      </button>
      {overlay}
    </>
  );
}

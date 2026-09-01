"use client";

import { useEffect, useRef, useState } from "react";
import { IconClose } from "@/components/icons";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  title?: string;
};

export function StaffQrCameraScanner({
  open,
  onClose,
  onScan,
  title = "สแกน QR",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef("");
  const lastScanAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let detector: BarcodeDetectorLike | null = null;

    async function start() {
      setBusy(true);
      setError(null);
      lastScanRef.current = "";
      lastScanAtRef.current = 0;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("อุปกรณ์นี้ไม่รองรับกล้อง");
        }

        const Detector = (
          window as Window & {
            BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;

        if (!Detector) {
          throw new Error(
            "เบราว์เซอร์นี้ยังสแกน QR จากกล้องไม่ได้ — กรอกรหัสสินค้าแทน",
          );
        }

        detector = new Detector({ formats: ["qr_code"] });

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }

        const tick = async () => {
          if (cancelled || !detector || !videoRef.current) return;
          const video = videoRef.current;
          if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
            rafRef.current = window.requestAnimationFrame(() => void tick());
            return;
          }
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              const now = Date.now();
              if (
                value !== lastScanRef.current ||
                now - lastScanAtRef.current > 2000
              ) {
                lastScanRef.current = value;
                lastScanAtRef.current = now;
                onScanRef.current(value);
                return;
              }
            }
          } catch {
            /* ignore frame errors */
          }
          rafRef.current = window.requestAnimationFrame(() => void tick());
        };

        rafRef.current = window.requestAnimationFrame(() => void tick());
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "เปิดกล้องไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-sm font-bold">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
          aria-label="ปิด"
        >
          <IconClose size={20} className="text-white" aria-hidden />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div className="h-52 w-52 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {busy ? (
          <p className="absolute inset-x-0 bottom-6 text-center text-sm text-white/80">
            กำลังเปิดกล้อง…
          </p>
        ) : null}
        {error ? (
          <div className="absolute inset-x-4 bottom-6 rounded-xl bg-red-600/90 px-4 py-3 text-center text-sm font-semibold text-white">
            {error}
          </div>
        ) : (
          <p className="absolute inset-x-0 bottom-6 text-center text-sm text-white/80">
            วาง QR ป้ายเมนู/สินค้าในกรอบ
          </p>
        )}
      </div>
    </div>
  );
}

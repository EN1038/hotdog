"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { btnOutline, btnPrimary } from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { sameOriginMediaProxyUrl } from "@/lib/share-media";

function needsCorsBypass(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/** Resolve any image src into a canvas-safe local URL (blob / data / same-origin). */
async function resolveCanvasImageSrc(src: string): Promise<{
  src: string;
  revoke?: () => void;
}> {
  if (
    src.startsWith("blob:") ||
    src.startsWith("data:") ||
    src.startsWith("/")
  ) {
    return { src };
  }

  if (!needsCorsBypass(src)) {
    return { src };
  }

  // Spaces/CDN blocks canvas read without CORS — fetch via same-origin proxy.
  const res = await fetch(sameOriginMediaProxyUrl(src));
  if (!res.ok) {
    throw new Error("โหลดรูปไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง");
  }
  const blob = await res.blob();
  if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") {
    throw new Error("ไฟล์นี้ไม่ใช่รูปภาพ");
  }
  const objectUrl = URL.createObjectURL(blob);
  return {
    src: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("โหลดรูปไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง"));
    img.src = src;
  });
}

async function cropToBlob(
  imageSrc: string,
  crop: Area,
  mime = "image/jpeg",
): Promise<Blob> {
  const resolved = await resolveCanvasImageSrc(imageSrc);
  try {
    const image = await loadHtmlImage(resolved.src);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("จัดขนาดรูปไม่สำเร็จ");
    ctx.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("จัดขนาดรูปไม่สำเร็จ")),
        mime,
        0.92,
      );
    });
  } finally {
    resolved.revoke?.();
  }
}

export function ImageCropDialog({
  open,
  imageSrc,
  aspect,
  title = "จัดขนาดรูป",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  imageSrc: string;
  aspect: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const toast = useToast();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, cropped: Area) => {
    setArea(cropped);
  }, []);

  if (!open) return null;

  async function confirm() {
    if (!area) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(imageSrc, area);
      const file = new File([blob], `crop-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      onConfirm(file);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "จัดขนาดรูปไม่สำเร็จ ลองใหม่อีกครั้ง";
      toast.error("จัดขนาดรูปไม่สำเร็จ", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-slate-500"
          >
            ยกเลิก
          </button>
        </div>
        <div className="relative h-[min(55vh,22rem)] bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="space-y-3 px-4 py-4">
          <label className="block text-xs font-semibold text-slate-600">
            ซูม
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnOutline} onClick={onCancel}>
              ยกเลิก
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !area}
              onClick={() => void confirm()}
            >
              {busy ? "กำลังจัดขนาด…" : "ใช้รูปนี้"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

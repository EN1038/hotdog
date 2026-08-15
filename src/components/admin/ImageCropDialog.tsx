"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { btnOutline, btnPrimary } from "@/components/admin/AdminShell";

async function cropToBlob(
  imageSrc: string,
  crop: Area,
  mime = "image/jpeg",
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่สามารถครอปรูปได้");
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
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("ครอปรูปไม่สำเร็จ"))),
      mime,
      0.92,
    );
  });
}

export function ImageCropDialog({
  open,
  imageSrc,
  aspect,
  title = "ครอปรูป",
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
      console.error(e);
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
              {busy ? "กำลังครอป…" : "ใช้รูปนี้"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

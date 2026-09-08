"use client";

import {
  IconCamera,
  IconClose,
  IconImage,
  IconPlus,
  IconTrash,
} from "@/components/icons";

export type StaffPhotoPickSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Header thumbnail URL; ignored when showThumb is false */
  thumbUrl?: string | null;
  /** Show header thumb / placeholder icon (default true) */
  showThumb?: boolean;
  onCamera: () => void;
  onAlbum: () => void;
  disabled?: boolean;
  footerText?: string;
  /** When set, shows a remove button instead of footerText */
  onRemove?: () => void;
  removeLabel?: string;
  "aria-label"?: string;
};

/**
 * Shared sheet: ถ่ายรูป / เลือกจากอัลบั้ม (same pattern as stock count attach).
 */
export function StaffPhotoPickSheet({
  open,
  onClose,
  title,
  subtitle,
  thumbUrl = null,
  showThumb = true,
  onCamera,
  onAlbum,
  disabled = false,
  footerText,
  onRemove,
  removeLabel = "ลบรูปแนบ",
  "aria-label": ariaLabel,
}: StaffPhotoPickSheetProps) {
  if (!open) return null;

  const thumb = thumbUrl?.trim() || null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3.5">
          {showThumb ? (
            <div
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl ${
                thumb
                  ? "bg-slate-100 ring-1 ring-slate-200"
                  : "bg-site-primary-soft ring-2 ring-dashed ring-site-primary/45"
              }`}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="relative flex h-full w-full items-center justify-center text-site-primary">
                  <IconImage size={22} />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-site-primary text-white ring-2 ring-white">
                    <IconPlus size={14} strokeWidth={2.5} />
                  </span>
                </span>
              )}
            </div>
          ) : null}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-base font-extrabold text-slate-900">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
            aria-label="ปิด"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-4 py-4">
          <button
            type="button"
            disabled={disabled}
            onClick={onCamera}
            className="flex flex-col items-center gap-2 rounded-2xl bg-amber-50 px-3 py-4 text-center ring-1 ring-amber-100 active:bg-amber-100 disabled:opacity-50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
              <IconCamera size={24} />
            </span>
            <span className="text-sm font-extrabold text-amber-950">ถ่ายรูป</span>
            <span className="text-[11px] font-medium text-amber-800/80">
              เปิดกล้องทันที
            </span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onAlbum}
            className="flex flex-col items-center gap-2 rounded-2xl bg-sky-50 px-3 py-4 text-center ring-1 ring-sky-100 active:bg-sky-100 disabled:opacity-50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-sm">
              <IconImage size={24} />
            </span>
            <span className="text-sm font-extrabold text-sky-950">
              เลือกจากอัลบั้ม
            </span>
            <span className="text-[11px] font-medium text-sky-800/80">
              เลือกรูปที่มีอยู่
            </span>
          </button>
        </div>

        {onRemove ? (
          <div className="border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={onRemove}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-3 text-sm font-bold text-red-700 active:bg-red-100"
            >
              <IconTrash size={16} />
              {removeLabel}
            </button>
          </div>
        ) : footerText ? (
          <p className="px-4 pb-4 text-center text-[11px] font-medium text-slate-400">
            {footerText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

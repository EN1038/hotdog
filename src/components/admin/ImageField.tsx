"use client";

import { useId, useRef, useState } from "react";
import { IconClose, IconImage, IconUpload } from "@/components/icons";
import { adminInputClass, adminLabelClass } from "@/components/admin/AdminShell";

type ImageFieldProps = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspectClassName?: string;
  /** compact: denser form; thumb: small square (~120px) */
  size?: "default" | "compact" | "thumb";
  className?: string;
};

export function ImageField({
  value,
  onChange,
  label = "รูปภาพ",
  aspectClassName = "aspect-[4/3]",
  size = "default",
  className = "",
}: ImageFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "อัปโหลดไม่สำเร็จ",
        );
      }
      onChange(data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPick(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  const emptyPad =
    size === "thumb"
      ? "px-2 py-3"
      : size === "compact"
        ? "px-4 py-6"
        : "px-5 py-10";
  const resolvedAspect = size === "thumb" ? "aspect-square" : aspectClassName;

  return (
    <div
      className={
        size === "thumb" ? `max-w-[7.5rem] ${className}`.trim() : className
      }
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className={`${adminLabelClass} mb-0`} htmlFor={inputId}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShowUrl((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          {showUrl ? "ซ่อนลิงก์" : "ใส่ลิงก์แทน"}
        </button>
      </div>

      <div
        className={`relative overflow-hidden rounded-xl border-2 border-dashed transition ${
          dragOver
            ? "border-red-400 bg-red-50"
            : value
              ? "border-transparent bg-gray-100"
              : "border-gray-200 bg-gradient-to-b from-gray-50 to-white"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onPick(e.dataTransfer.files);
        }}
      >
        {value ? (
          <div className={`relative ${resolvedAspect}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold text-gray-900 shadow-sm hover:bg-white disabled:opacity-60"
              >
                {uploading ? "..." : "เปลี่ยน"}
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => onChange("")}
                className="inline-flex items-center gap-0.5 rounded-md bg-black/40 px-2 py-1 text-[11px] font-medium text-white hover:bg-black/55 disabled:opacity-60"
              >
                <IconClose size={11} />
                ลบ
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={`flex w-full ${resolvedAspect} flex-col items-center justify-center gap-1.5 text-center ${emptyPad} disabled:opacity-60`}
          >
            <span
              className={`flex items-center justify-center rounded-full bg-red-50 text-red-600 ${
                size === "thumb" ? "h-8 w-8" : "h-12 w-12"
              }`}
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <IconUpload size={size === "thumb" ? 14 : 22} />
              )}
            </span>
            <span
              className={`font-semibold text-gray-900 ${
                size === "thumb" ? "text-[11px] leading-tight" : "text-sm"
              }`}
            >
              {uploading
                ? "กำลังอัปโหลด..."
                : size === "thumb"
                  ? "เลือกรูป"
                  : "ลากรูปมาวาง หรือคลิกเพื่อเลือก"}
            </span>
            {size !== "thumb" && (
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <IconImage size={14} />
                JPG, PNG, WEBP, GIF · สูงสุด 5MB
              </span>
            )}
          </button>
        )}

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {showUrl && (
        <div className="mt-2">
          <label className={adminLabelClass}>หรือวางลิงก์รูป</label>
          <input
            className={adminInputClass}
            value={value}
            onChange={(e) => {
              setError(null);
              onChange(e.target.value);
            }}
            placeholder="https://... หรือ /uploads/..."
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

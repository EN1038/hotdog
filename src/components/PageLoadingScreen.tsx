"use client";

import { LoadingState } from "@/components/LoadingState";

/** เต็มจอ — ใช้กับ loading.tsx / รอ session / เข้าแอปครั้งแรก */
export function PageLoadingScreen({
  label = "กำลังโหลด…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-dvh flex-col items-center justify-center bg-[#eef3f8] px-4 py-10 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingState label={label} className="w-full max-w-sm" />
    </div>
  );
}

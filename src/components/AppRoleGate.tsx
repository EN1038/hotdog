import Link from "next/link";
import { PlatformMarkImage } from "@/components/PlatformMarkImage";
import type { MarkAssetKind } from "@/lib/platform-branding";

function IconOwner({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 19c.8-3.2 3.2-5 6.5-5s5.7 1.8 6.5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCustomer({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 7V5a4 4 0 018 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconStaff({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.8 19c.7-2.8 2.7-4.3 5.2-4.3s4.5 1.5 5.2 4.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14.2 19c.4-1.8 1.5-2.9 3.3-2.9 1.7 0 2.8 1.1 3.2 2.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppRoleGate({
  siteName,
  markSrc,
  markKind,
}: {
  siteName: string;
  markSrc: string;
  markKind: MarkAssetKind;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0b2a4a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#123a63] via-[#0b2a4a] to-[#071c32]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-[#ea580c]/25 blur-3xl"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <PlatformMarkImage
            src={markSrc}
            alt={siteName}
            kind={markKind}
            height={56}
            priority
          />
          <p className="mt-3 text-sm font-medium text-white/85">
            ร้านค้าในมือคุณ
          </p>
        </div>

        <div className="pb-4">
          <p className="mb-3 text-center text-sm font-medium text-white/90">
            เข้าใช้งานในฐานะ
          </p>
          <div className="space-y-3">
            <Link
              href="/malawaiwai"
              className="flex min-h-16 items-center gap-4 rounded-2xl bg-white px-5 text-left text-gray-900 shadow-lg active:scale-[0.99]"
            >
              <span className="text-[#0b2a4a]">
                <IconCustomer />
              </span>
              <span>
                <span className="block text-lg font-semibold">ลูกค้า</span>
                <span className="block text-xs font-medium text-gray-500">
                  สั่งอาหารออนไลน์
                </span>
              </span>
            </Link>
            <Link
              href="/staff/login"
              className="flex min-h-16 items-center gap-4 rounded-2xl bg-white px-5 text-left text-gray-900 shadow-lg active:scale-[0.99]"
            >
              <span className="text-[#0b2a4a]">
                <IconStaff />
              </span>
              <span>
                <span className="block text-lg font-semibold">
                  ผู้จัดการร้าน / พนักงาน
                </span>
                <span className="block text-xs font-medium text-gray-500">
                  คีย์ออเดอร์ · คิว · เปิดรอบขาย
                </span>
              </span>
            </Link>
            <Link
              href="/owner/login"
              className="flex min-h-16 items-center gap-4 rounded-2xl bg-white px-5 text-left text-gray-900 shadow-lg active:scale-[0.99]"
            >
              <span className="text-[#0b2a4a]">
                <IconOwner />
              </span>
              <span>
                <span className="block text-lg font-semibold">เจ้าของร้าน</span>
                <span className="block text-xs font-medium text-gray-500">
                  หลังบ้าน · เมนู · ยอดขาย
                </span>
              </span>
            </Link>
          </div>

          <p className="mt-6 text-center text-sm text-white/80">
            ยังไม่มีบัญชี?{" "}
            <Link
              href="/owner/register"
              className="font-semibold text-amber-300 underline underline-offset-2"
            >
              สมัครเป็นร้านค้า
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { PlatformMarkImage } from "@/components/PlatformMarkImage";
import {
  getPlatformSettings,
  resolvePlatformMarkForPlacement,
} from "@/lib/platform-settings";

export default async function HomePage() {
  const settings = await getPlatformSettings();
  const homeMark = resolvePlatformMarkForPlacement(settings, "home");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#f3f1ef] p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full opacity-35 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 40%, transparent), transparent 70%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <PlatformMarkImage
            src={homeMark.src}
            alt={settings.siteName}
            kind={homeMark.kind}
            height={56}
            priority
          />
          <p className="text-sm text-gray-600">ระบบสั่งอาหารออนไลน์</p>
        </div>
        <div className="space-y-3">
          <Link
            href="/malawaiwai"
            className="block rounded-2xl bg-site-primary px-6 py-4 font-medium text-white hover:opacity-90"
          >
            สั่งอาหาร (ลูกค้า)
          </Link>
          <Link
            href="/staff/login"
            className="block rounded-2xl border border-gray-200 bg-white px-6 py-4 font-medium text-gray-800 hover:bg-white/80"
          >
            พนักงาน (ขาย / ส่ง)
          </Link>
          <Link
            href="/admin/login"
            className="block rounded-2xl border border-gray-200 bg-white px-6 py-4 font-medium text-gray-800 hover:bg-white/80"
          >
            ผู้ดูแลระบบ (Admin)
          </Link>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import type { MarkAssetKind } from "@/lib/platform-branding";

const ROLE_GATE_BG = "/bg_choose_role.webp";
const ROLE_GATE_LOGO = "/logo_veticle.png";
const ROLE_GATE_SECURITY_ICON = "/icon_security.webp";

function LucideIcon({
  size = 26,
  strokeWidth = 2,
  children,
}: {
  size?: number;
  strokeWidth?: number;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function IconShoppingBag() {
  return (
    <LucideIcon>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </LucideIcon>
  );
}

function IconUsers() {
  return (
    <LucideIcon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </LucideIcon>
  );
}

function IconUser() {
  return (
    <LucideIcon>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </LucideIcon>
  );
}

function IconChevronRight() {
  return (
    <LucideIcon size={20}>
      <path d="m9 6 6 6-6 6" />
    </LucideIcon>
  );
}

function IconUserCircle() {
  return (
    <LucideIcon size={18} strokeWidth={1.25}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </LucideIcon>
  );
}

function RoleCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[5.75rem] items-center gap-3.5 rounded-[1.375rem] bg-white px-4 py-3.5 text-left shadow-[0_8px_28px_-12px_rgba(0,0,0,0.28)] transition-transform duration-150 active:scale-[0.98]"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100/80">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-bold leading-snug text-[#0b2a4a]">
          {title}
        </span>
        <span className="mt-0.5 block text-[14px] font-medium leading-snug text-slate-500">
          {description}
        </span>
      </span>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
        aria-hidden
      >
        <IconChevronRight />
      </span>
    </Link>
  );
}

export function AppRoleGate({
  siteName,
}: {
  siteName: string;
  markSrc: string;
  markKind: MarkAssetKind;
}) {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#062B4B] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${ROLE_GATE_BG}')` }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pt-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ROLE_GATE_LOGO}
            alt={siteName}
            width={160}
            height={160}
            className="mx-auto h-auto w-[10rem] max-w-[70vw] object-contain drop-shadow-[0_4px_24px_rgba(16,185,129,0.25)]"
            fetchPriority="high"
          />
          <p className="mt-5 text-[1.75rem] font-bold leading-tight tracking-tight text-white">
            ร้านค้าในมือคุณ
          </p>
          <div className="mt-4 flex items-center justify-center gap-3 px-16">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-400/50" />
            <span className="text-[13px] text-emerald-300/90" aria-hidden>
              ✦
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-emerald-400/50" />
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
            <div className="flex shrink-0 items-center gap-2 text-white/95">
              <span className="text-emerald-200/90">
                <IconUserCircle />
              </span>
              <span className="text-[15px] font-semibold">เข้าใช้งานในฐานะ</span>
            </div>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
          </div>

          <div className="mt-5 space-y-3.5">
            <RoleCard
              href="/malawaiwai"
              icon={<IconShoppingBag />}
              title="ลูกค้า"
              description="สั่งอาหารออนไลน์"
            />
            <RoleCard
              href="/staff/login"
              icon={<IconUsers />}
              title="ผู้จัดการร้าน / พนักงาน"
              description="คีย์ออเดอร์ · คิว · เปิดรอบขาย"
            />
            <RoleCard
              href="/owner/login"
              icon={<IconUser />}
              title="เจ้าของร้าน"
              description="หลังบ้าน · เมนู · ยอดขาย"
            />
          </div>
        </div>

        <Link
          href="/owner/register"
          className="mt-8 block rounded-[1.125rem] bg-[#041f38]/55 px-4 py-3.5 ring-1 ring-white/10 backdrop-blur-sm transition-transform duration-150 active:scale-[0.98]"
        >
          <div className="flex items-center justify-center gap-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ROLE_GATE_SECURITY_ICON}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 object-contain [filter:brightness(0)_saturate(100%)_invert(84%)_sepia(31%)_saturate(638%)_hue-rotate(103deg)_brightness(98%)_contrast(92%)]"
              aria-hidden
            />
            <p className="text-[14px] leading-snug text-white/90">
              ยังไม่มีบัญชี?{" "}
              <span className="font-bold text-emerald-300 underline decoration-emerald-400/60 underline-offset-[3px]">
                สมัครเป็นร้านค้า
              </span>
            </p>
          </div>
        </Link>
      </div>
    </main>
  );
}

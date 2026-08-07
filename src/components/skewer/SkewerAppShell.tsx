"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCustomer } from "@/components/customer/CustomerProvider";
import { CustomerLoginScreen } from "@/components/customer/CustomerLoginScreen";
import { LoadingState } from "@/components/LoadingState";
import { useSiteBranding } from "@/components/customer/SiteBrandingProvider";
import {
  IconHome,
  IconLogout,
  IconReceipt,
  IconStore,
} from "@/components/icons";
import { brandColorFromApi } from "@/lib/color";

export type SkewerShellTab = "home" | "order" | "history";

export type SkewerBranchMeta = {
  name?: string;
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  brandName?: string;
  brandLogoUrl?: string | null;
  brandCoverUrl?: string | null;
  brandColor?: string | null;
  /** Branch storefront / QR photo — used as login hero like CustomerEntryGate */
  branchImageUrl?: string | null;
};

type ShellProps = {
  branchId: string;
  active: SkewerShellTab;
  meta?: SkewerBranchMeta;
  children: ReactNode;
  /** When false, only auth-gate (for key-order layout pages) */
  showChrome?: boolean;
};

function IconSkewer({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20L14 10M10 20l10-10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="7.5" r="1.5" fill="currentColor" />
      <circle cx="12.5" cy="11.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function useSkewerBranchMeta(branchId: string): SkewerBranchMeta {
  const [name, setName] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | undefined>();
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [brandCoverUrl, setBrandCoverUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [branchImageUrl, setBranchImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skewer/branch?branchId=${encodeURIComponent(branchId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลดสาขาไม่สำเร็จ");
        if (cancelled) return;
        setName(typeof data.name === "string" ? data.name : undefined);
        setIsOpen(data.isOpen !== false);
        setBranchImageUrl(
          typeof data.imageUrl === "string" && data.imageUrl.trim()
            ? data.imageUrl.trim()
            : null,
        );
        const brand = data.brand;
        if (brand && typeof brand === "object") {
          setBrandName(
            (typeof brand.nameTh === "string" && brand.nameTh.trim()) ||
              (typeof brand.name === "string" ? brand.name : undefined),
          );
          setBrandLogoUrl(
            typeof brand.logoUrl === "string" && brand.logoUrl.trim()
              ? brand.logoUrl.trim()
              : null,
          );
          setBrandCoverUrl(
            typeof brand.coverImageUrl === "string" && brand.coverImageUrl.trim()
              ? brand.coverImageUrl.trim()
              : null,
          );
          setBrandColor(
            typeof brand.color === "string" ? brand.color : null,
          );
        }
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  return {
    name,
    isOpen,
    loading,
    error,
    brandName,
    brandLogoUrl,
    brandCoverUrl,
    brandColor,
    branchImageUrl,
  };
}

export function SkewerAuthGate({
  branchName,
  brandLogoUrl,
  heroImageUrl,
  children,
}: {
  branchName?: string;
  brandLogoUrl?: string | null;
  heroImageUrl?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const { session, sessionChecked } = useCustomer();

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4">
        <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
      </main>
    );
  }

  if (!session) {
    return (
      <CustomerLoginScreen
        showBackButton={false}
        showBrowseOption={false}
        brandName={branchName}
        brandLogoUrl={brandLogoUrl}
        heroImageUrl={heroImageUrl}
        browseHint="ต้องเข้าสู่ระบบด้วยเบอร์โทรก่อนสั่งเสียบไม้"
        onSuccess={() => router.refresh()}
      />
    );
  }

  return <>{children}</>;
}

export function SkewerAppShell({
  branchId,
  active,
  meta,
  children,
  showChrome = true,
}: ShellProps) {
  const branding = useSiteBranding();
  const { session, logout } = useCustomer();
  const pathname = usePathname();
  const base = `/skewer/${branchId}`;

  const resolvedMeta = meta ?? {
    name: undefined,
    isOpen: true,
    loading: false,
    error: null,
  };

  const brandName =
    resolvedMeta.brandName || branding.siteName || "SkillSale";
  const branchName = resolvedMeta.name || "";
  const logoUrl = resolvedMeta.brandLogoUrl || branding.logoUrl;
  const coverUrl = resolvedMeta.brandCoverUrl || null;
  const heroImageUrl =
    resolvedMeta.branchImageUrl || coverUrl || null;
  const accent =
    brandColorFromApi(resolvedMeta.brandColor) ||
    branding.primaryColor ||
    "#ea580c";

  const tabs: {
    id: SkewerShellTab;
    href: string;
    label: string;
    icon: ReactNode;
  }[] = [
    {
      id: "home",
      href: base,
      label: "หน้าหลัก",
      icon: <IconHome size={22} />,
    },
    {
      id: "order",
      href: `${base}/order`,
      label: "สั่งไม้",
      icon: <IconSkewer size={22} />,
    },
    {
      id: "history",
      href: `${base}/history`,
      label: "ประวัติ",
      icon: <IconReceipt size={22} />,
    },
  ];

  return (
    <SkewerAuthGate
      branchName={branchName || brandName}
      brandLogoUrl={logoUrl}
      heroImageUrl={heroImageUrl}
    >
      {!showChrome ? (
        children
      ) : (
        <div className="min-h-screen bg-[#f3f4f6] pb-[4.75rem]">
          <header className="relative overflow-hidden bg-[#1e1e1e] text-white shadow-md">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/85 backdrop-blur-[2px]" />

            <div className="relative z-[60] mx-auto max-w-lg px-4 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
              <div className="flex items-center gap-3.5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/40 shadow-md">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/90">
                      <IconStore size={26} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-extrabold leading-tight drop-shadow-sm">
                    {brandName}
                  </p>
                  <p className="mt-1 truncate text-xs font-medium text-white/90 drop-shadow-sm">
                    {branchName
                      ? `สาขา ${branchName.replace(/^สาขา\s*/, "")}`
                      : "สั่งเสียบไม้"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex h-11 max-w-[9.5rem] flex-col items-center justify-center rounded-full bg-white/20 px-3 py-1 text-center text-white shadow-sm">
                    <span className="text-[9px] font-semibold leading-none text-white/90">
                      {session?.name?.trim() ? "ชื่อที่เข้าใช้" : "เบอร์ที่เข้าใช้"}
                    </span>
                    <span className="mt-0.5 truncate text-[11px] font-extrabold leading-tight">
                      {session?.name?.trim() || session?.phone || "—"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white shadow-sm transition hover:bg-white/30"
                    aria-label="ออกจากระบบ"
                    title="ออกจากระบบ"
                  >
                    <IconLogout size={20} />
                  </button>
                </div>
              </div>

              {pathname && !resolvedMeta.isOpen ? (
                <div className="mt-3.5 rounded-xl bg-red-500/90 px-3 py-2 text-center text-xs font-semibold text-white">
                  สาขายังปิดรับออเดอร์ชั่วคราว
                </div>
              ) : null}
            </div>
          </header>

          <div className="mx-auto max-w-lg">{children}</div>

          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
            aria-label="เมนูหลักสั่งเสียบไม้"
          >
            <div className="mx-auto grid max-w-lg grid-cols-3 px-1 pt-1">
              {tabs.map((tab) => {
                const isActive = active === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className={`relative flex flex-col items-center gap-0.5 py-2 ${
                      isActive ? "text-orange-600" : "text-slate-500"
                    }`}
                    style={isActive ? { color: accent } : undefined}
                  >
                    {tab.icon}
                    <span className="truncate text-[10px] font-semibold">
                      {tab.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </SkewerAuthGate>
  );
}

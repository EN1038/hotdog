"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  IconHome,
  IconReceipt,
  IconStore,
} from "@/components/icons";
import { formatPrice } from "@/lib/constants";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import { DEFAULT_BRAND_COLOR, normalizePrimaryColor } from "@/lib/color";
import {
  OwnerProfileMenuButton,
  useOwnerViewHomeSoftRedirect,
} from "@/components/owner/OwnerViewSwitch";
import { OwnerTrialBanner } from "@/components/owner/OwnerTrialBanner";

export type OwnerShellTab = "home" | "today" | "summary" | "settings";

type OwnerDashboardContextValue = {
  data: OwnerDashboardPayload | null;
  loading: boolean;
  reload: () => void;
};

const OwnerDashboardContext = createContext<OwnerDashboardContextValue>({
  data: null,
  loading: true,
  reload: () => {},
});

export function useOwnerDashboard() {
  return useContext(OwnerDashboardContext);
}

function IconChart({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 12V4a8 8 0 017.5 5.2L12 12z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

function IconGear({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function OwnerAppShell({
  children,
  active,
}: {
  children: ReactNode;
  active: OwnerShellTab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loaded } = useAdminSession();
  const [data, setData] = useState<OwnerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    fetch("/api/owner/dashboard?period=day")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/owner/login");
          return null;
        }
        if (res.status === 403) {
          router.replace("/admin");
          return null;
        }
        if (!res.ok) return null;
        return (await res.json()) as OwnerDashboardPayload;
      })
      .then((payload) => {
        if (payload) setData(payload);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!loaded) return;
    if (!session) {
      router.replace("/owner/login");
      return;
    }
    if (session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    reload();
  }, [loaded, session, router, reload, pathname]);

  useOwnerViewHomeSoftRedirect(
    loaded && session && !session.isPlatformAdmin && pathname === "/owner"
      ? "mobile"
      : null,
  );

  const brandName = data?.brand?.nameTh || data?.brand?.name || "ร้านค้า";
  const logoUrl = data?.brand?.logoUrl;
  const coverUrl = data?.brand?.coverImageUrl;
  const accent = normalizePrimaryColor(
    data?.brand?.color,
    DEFAULT_BRAND_COLOR,
  );
  const todayRevenue = data?.stats.completedRevenue ?? 0;
  const completedCount = data?.stats.completedCount ?? 0;
  const openCount = data?.stats.openCount ?? 0;
  const subscription = data?.subscription ?? null;
  const isTrial =
    subscription?.status === "TRIAL" ||
    subscription?.effectiveStatus === "TRIAL";
  const packageBanner = subscription?.writeAllowed === false
    ? {
        tone: "border-rose-200 bg-rose-50 text-rose-950",
        text:
          subscription.writeBlockedReason ??
          "แพ็กเกจหมดอายุ — ยังดูข้อมูลได้ แต่สร้างรายการใหม่ไม่ได้",
      }
    : !isTrial && subscription?.nearExpiry
      ? {
          tone: "border-amber-200 bg-amber-50 text-amber-950",
          text:
            subscription.daysLeft != null
              ? subscription.daysLeft > 0
                ? `แพ็กเกจใกล้หมดอายุ · เหลือ ${subscription.daysLeft} วัน`
                : "แพ็กเกจจะหมดอายุวันนี้"
              : "แพ็กเกจใกล้หมดอายุ",
        }
      : null;

  useEffect(() => {
    document.documentElement.style.setProperty("--site-primary", accent);
  }, [accent]);

  const tabs: {
    id: OwnerShellTab;
    href: string;
    label: string;
    icon: ReactNode;
    badge?: number;
  }[] = [
    {
      id: "home",
      href: "/owner",
      label: "หน้าแรก",
      icon: <IconHome size={24} />,
    },
    {
      id: "today",
      href: "/owner/today",
      label: "ออเดอร์วันนี้",
      icon: <IconReceipt size={24} />,
      badge: openCount,
    },
    {
      id: "summary",
      href: "/owner/summary",
      label: "สรุปยอด",
      icon: <IconChart size={26} />,
    },
    {
      id: "settings",
      href: "/owner/settings",
      label: "ตั้งค่า",
      icon: <IconGear size={24} />,
    },
  ];

  const value = useMemo(
    () => ({ data, loading, reload }),
    [data, loading, reload],
  );

  if (!loaded || !session || session.isPlatformAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#eef3f8] text-sm text-slate-500">
        กำลังเข้าสู่ร้าน…
      </div>
    );
  }

  return (
    <OwnerDashboardContext.Provider value={value}>
      <div className="min-h-dvh bg-[#eef3f8] pb-[4.75rem]">
        <header className="relative overflow-hidden bg-site-primary text-white">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40" />
          <div className="relative z-10 mx-auto max-w-lg px-4 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-extrabold leading-tight">
                  {brandName}
                </p>
                <p className="mt-0.5 text-xs font-medium text-white/85">
                  ยอดวันนี้ {formatPrice(todayRevenue)} บาท ·{" "}
                  {formatPrice(completedCount)} บิล
                  {openCount > 0 ? ` · ค้าง ${formatPrice(openCount)}` : ""}
                </p>
              </div>
              <OwnerProfileMenuButton
                photoUrl={logoUrl}
                displayName={brandName}
                username={session.username}
                fallbackIcon={<IconStore size={22} />}
              />
            </div>
          </div>
        </header>

        {packageBanner ? (
          <div className={`border-b px-4 py-2.5 ${packageBanner.tone}`}>
            <div className="mx-auto max-w-lg">
              <p className="text-[13px] font-semibold">{packageBanner.text}</p>
            </div>
          </div>
        ) : null}

        {isTrial ? (
          <div className="mx-auto max-w-lg pt-3">
            <OwnerTrialBanner subscription={subscription} />
          </div>
        ) : null}

        <div className="mx-auto max-w-lg">{children}</div>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
          aria-label="เมนูหลักเจ้าของร้าน"
        >
          <div className="mx-auto flex max-w-lg items-end justify-between px-1 pt-2">
            {tabs.map((tab) => {
              const isActive = active === tab.id;
              const isFeatured = tab.id === "summary";

              if (isFeatured) {
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className="relative flex min-w-0 flex-1 flex-col items-center justify-end pb-1.5"
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span
                      className={`-mt-6 flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(15,23,42,0.22)] ring-[3px] ring-white transition active:scale-95 ${
                        isActive ? "bg-site-primary" : "bg-site-primary/90"
                      }`}
                    >
                      {tab.icon}
                    </span>
                    <span
                      className={`mt-1 truncate text-[12px] font-extrabold ${
                        isActive ? "text-site-primary" : "text-slate-700"
                      }`}
                    >
                      {tab.label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={`relative flex min-h-[3.75rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 ${
                    isActive ? "text-site-primary" : "text-slate-500"
                  }`}
                >
                  <span className="relative">
                    {tab.icon}
                    {(tab.badge ?? 0) > 0 ? (
                      <span className="absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-site-primary px-0.5 text-[11px] font-bold text-white">
                        {tab.badge! > 99 ? "99+" : tab.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-[13px] font-bold">
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </OwnerDashboardContext.Provider>
  );
}

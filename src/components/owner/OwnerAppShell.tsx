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
  IconBag,
  IconChart,
  IconGear,
  IconHome,
  IconReceipt,
} from "@/components/icons";
import { formatPrice } from "@/lib/constants";
import type { OwnerDashboardPayload } from "@/lib/owner-dashboard";
import { DEFAULT_BRAND_COLOR, normalizePrimaryColor } from "@/lib/color";
import {
  OwnerProfileMenuButton,
  useOwnerViewHomeSoftRedirect,
} from "@/components/owner/OwnerViewSwitch";
import { OwnerTrialBanner } from "@/components/owner/OwnerTrialBanner";
import { OwnerDashboardHeaderDecor } from "@/components/owner/OwnerDashboardHeaderDecor";

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
      <div className="owner-shell-bg flex min-h-dvh items-center justify-center text-sm text-slate-500">
        กำลังเข้าสู่ร้าน…
      </div>
    );
  }

  return (
    <OwnerDashboardContext.Provider value={value}>
      <div className="owner-shell-bg min-h-dvh pb-[5.5rem]">
        <header className="relative overflow-hidden bg-site-primary text-white">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
            />
          ) : null}
          <OwnerDashboardHeaderDecor />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40" />
          <div className="relative z-10 mx-auto max-w-lg px-4 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/45 shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[18px] font-black leading-tight text-white drop-shadow-sm">
                  {brandName}
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-white/85">
                  ยอดวันนี้ {formatPrice(todayRevenue)} บาท ·{" "}
                  {formatPrice(completedCount)} บิล
                  {openCount > 0 ? ` · ค้าง ${formatPrice(openCount)}` : ""}
                </p>
              </div>
              <OwnerProfileMenuButton
                photoUrl={null}
                displayName={brandName}
                username={session.username}
                fallbackIcon={<IconBag size={22} />}
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
          <div className="relative z-20 mx-auto max-w-lg -mt-3 px-4">
            <OwnerTrialBanner subscription={subscription} />
          </div>
        ) : null}

        <div className="mx-auto max-w-lg">{children}</div>

        <nav
          className="owner-nav-float fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-[1.35rem] border border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
          aria-label="เมนูหลักเจ้าของร้าน"
        >
          <div className="flex items-end justify-between px-2 pt-2">
            {tabs.map((tab) => {
              const isActive = active === tab.id;

              if (isActive) {
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className="relative flex min-w-0 flex-1 flex-col items-center justify-end pb-2"
                    aria-current="page"
                  >
                    <span className="relative -mt-7 flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full bg-site-primary text-white shadow-site-primary-lg ring-[3px] ring-white transition active:scale-95">
                      {tab.icon}
                      {(tab.badge ?? 0) > 0 ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[10px] font-bold text-white ring-2 ring-white">
                          {tab.badge! > 99 ? "99+" : tab.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 truncate text-[12px] font-extrabold text-site-primary">
                      {tab.label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className="relative flex min-h-[3.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-400"
                >
                  <span className="relative opacity-90">
                    {tab.icon}
                    {(tab.badge ?? 0) > 0 ? (
                      <span className="absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-site-primary px-0.5 text-[10px] font-bold text-white">
                        {tab.badge! > 99 ? "99+" : tab.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-[11px] font-bold text-slate-500">
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

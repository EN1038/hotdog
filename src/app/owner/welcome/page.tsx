"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  formatTrialEndsAt,
  formatDaysRemaining,
  daysUntilDate,
} from "@/components/admin/BrandPlanBanner";
import {
  OwnerWelcomeContent,
  OwnerWelcomeLoading,
  type OwnerWelcomeStep,
} from "@/components/owner/owner-welcome-ui";
import { OWNER_REGISTER_TRIAL_DAYS } from "@/lib/owner-register-shared";
import { PLATFORM_LINE_ADD_URL } from "@/lib/platform-support";

type WelcomePayload = {
  brandName: string;
  subscription: {
    trialEndsAt: string | null;
    planLabel: string;
    status: string;
  } | null;
  branches: Array<{ id: string; name: string }>;
};

const START_STEPS: readonly OwnerWelcomeStep[] = [
  {
    n: 1,
    title: "ตั้งเมนูและราคา",
    hint: "ถ้ายังไม่ได้ นำเข้าจากแม่แบบ",
    icon: "menu",
  },
  {
    n: 2,
    title: "เปิดรอบขาย",
    hint: "ที่หน้าร้าน / มือถือพนักงาน",
    icon: "store",
  },
  {
    n: 3,
    title: "เชิญพนักงาน",
    hint: "ด้วยเบอร์โทร ล็อกอิน OTP",
    icon: "staff",
  },
];

export default function OwnerWelcomePage() {
  const router = useRouter();
  const { session, loaded } = useAdminSession();
  const [data, setData] = useState<WelcomePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    if (!session) {
      router.replace("/owner/register");
      return;
    }
    if (session.isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/owner/dashboard?period=day");
        if (!res.ok) {
          router.replace("/owner/login");
          return;
        }
        const payload = await res.json();
        setData({
          brandName: payload.brand?.name ?? "ร้านของคุณ",
          subscription: payload.subscription ?? null,
          branches: (payload.branches ?? []).filter(
            (b: { isHidden?: boolean; kind?: string }) =>
              !b.isHidden && b.kind !== "WAREHOUSE",
          ),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loaded, session, router]);

  const trialEnds = data?.subscription?.trialEndsAt ?? null;
  const trialLabel = formatTrialEndsAt(trialEnds);
  const daysLeft = daysUntilDate(trialEnds);
  const daysLeftText = formatDaysRemaining(daysLeft);
  const branchName =
    data?.branches.find((b) => b.name.includes("หลัก"))?.name ??
    data?.branches[0]?.name ??
    "สาขาหลัก";
  const trialProgress =
    daysLeft != null && daysLeft >= 0
      ? Math.round(
          ((OWNER_REGISTER_TRIAL_DAYS - daysLeft) / OWNER_REGISTER_TRIAL_DAYS) *
            100,
        )
      : 0;

  const readyItems = useMemo(() => {
    if (!data) return [];
    const items = [
      {
        id: "brand",
        label: <>สร้างร้าน {data.brandName}</>,
      },
      {
        id: "branch",
        label: <>สาขา {branchName} พร้อมใช้งาน</>,
      },
    ];
    if (data.subscription?.planLabel) {
      items.push({
        id: "plan",
        label: <>แพ็ก {data.subscription.planLabel}</>,
      });
    }
    return items;
  }, [data, branchName]);

  if (loading || !data) {
    return <OwnerWelcomeLoading />;
  }

  return (
    <OwnerWelcomeContent
      brandName={data.brandName}
      readyItems={readyItems}
      steps={START_STEPS}
      trialDaysTotal={OWNER_REGISTER_TRIAL_DAYS}
      daysLeft={daysLeft}
      trialLabel={trialLabel}
      daysLeftText={daysLeftText}
      trialProgress={trialProgress}
      lineUrl={PLATFORM_LINE_ADD_URL}
    />
  );
}

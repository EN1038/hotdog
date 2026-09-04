import { prisma } from "@/lib/db";
import { bangkokDateKey, formatThaiPhone } from "@/lib/constants";
import { isLineMessagingReady, linePushText } from "@/lib/line";
import { listUnlockedPlatformLineUserIds } from "@/lib/line-platform-auth";
import {
  brandStatusLabelTh,
  findInactiveOnboardBrands,
  getPlatformOpsDashboard,
} from "@/lib/platform-ops-metrics";
import { effectiveBrandStatus } from "@/lib/brand-plan-shared";

type NotifyFlag =
  | "lineNotifyTrialEnding"
  | "lineNotifyBrandStatus"
  | "lineNotifyInactiveOnboard"
  | "lineNotifySystemErrors"
  | "lineNotifyDailyOpsSummary";

const SMS_FAIL_SPIKE = 5;

async function pushToUnlocked(text: string): Promise<number> {
  if (!(await isLineMessagingReady())) return 0;
  const recipients = await listUnlockedPlatformLineUserIds();
  if (recipients.length === 0) return 0;
  await Promise.all(
    recipients.map((lineUserId) =>
      linePushText(lineUserId, text).catch((e) => {
        console.error(
          "[line] platform-ops push failed",
          lineUserId,
          e instanceof Error ? e.message : e,
        );
      }),
    ),
  );
  return recipients.length;
}

async function flagEnabled(flag: NotifyFlag): Promise<boolean> {
  const settings = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: {
      lineNotifyTrialEnding: true,
      lineNotifyBrandStatus: true,
      lineNotifyInactiveOnboard: true,
      lineNotifySystemErrors: true,
      lineNotifyDailyOpsSummary: true,
    },
  });
  return Boolean(settings?.[flag]);
}

/** Returns true if this is the first claim for kind/brand/day (dedupe). */
export async function claimOpsNotify(input: {
  kind: string;
  brandId?: string;
  dayKey?: string;
}): Promise<boolean> {
  const dayKey = input.dayKey ?? bangkokDateKey();
  const brandId = input.brandId ?? "";
  try {
    await prisma.platformOpsNotifyLog.create({
      data: { kind: input.kind, brandId, dayKey },
    });
    return true;
  } catch {
    return false;
  }
}

export async function notifyPlatformBrandStatusChange(input: {
  brandId: string;
  brandName: string;
  brandCode: string;
  fromStatus: string;
  toStatus: "PAUSED" | "EXPIRED";
}): Promise<void> {
  try {
    if (!(await flagEnabled("lineNotifyBrandStatus"))) return;
    const kind = `status_${input.toStatus.toLowerCase()}`;
    if (
      !(await claimOpsNotify({
        kind,
        brandId: input.brandId,
      }))
    ) {
      return;
    }
    const text = [
      `แบรนด์เปลี่ยนสถานะเป็น${brandStatusLabelTh(input.toStatus)}`,
      "",
      `ร้าน: ${input.brandName}`,
      `รหัส: ${input.brandCode}`,
      `จาก: ${input.fromStatus} → ${input.toStatus}`,
    ].join("\n");
    await pushToUnlocked(text);
  } catch (e) {
    console.error(
      "[line] notifyPlatformBrandStatusChange failed",
      e instanceof Error ? e.message : e,
    );
  }
}

export async function runPlatformOpsLineJobs(now = new Date()): Promise<{
  trialEnding: number;
  inactive: number;
  expiredEffective: number;
  smsErrors: boolean;
  dailySummary: boolean;
}> {
  const dayKey = bangkokDateKey(now);
  const result = {
    trialEnding: 0,
    inactive: 0,
    expiredEffective: 0,
    smsErrors: false,
    dailySummary: false,
  };

  // 1) Trial ending in 1 / 3 days
  if (await flagEnabled("lineNotifyTrialEnding")) {
    const dash = await getPlatformOpsDashboard(now);
    for (const row of dash.trialEnding1d) {
      if (
        await claimOpsNotify({
          kind: "trial_ending_1d",
          brandId: row.id,
          dayKey,
        })
      ) {
        await pushToUnlocked(
          [
            "ทดลองใกล้หมดอายุ (1 วัน)",
            "",
            `ร้าน: ${row.name}`,
            `รหัส: ${row.code}`,
            row.trialEndsAt
              ? `หมดอายุ: ${new Date(row.trialEndsAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}`
              : null,
            row.contactPhone
              ? `เบอร์: ${formatThaiPhone(row.contactPhone)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        result.trialEnding += 1;
      }
    }
    for (const row of dash.trialEnding3d) {
      if (
        await claimOpsNotify({
          kind: "trial_ending_3d",
          brandId: row.id,
          dayKey,
        })
      ) {
        await pushToUnlocked(
          [
            "ทดลองใกล้หมดอายุ (3 วัน)",
            "",
            `ร้าน: ${row.name}`,
            `รหัส: ${row.code}`,
            row.daysLeft != null ? `เหลือประมาณ ${row.daysLeft} วัน` : null,
            row.contactPhone
              ? `เบอร์: ${formatThaiPhone(row.contactPhone)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        result.trialEnding += 1;
      }
    }
  }

  // 2) Effective EXPIRED (trial lapsed but status still TRIAL)
  if (await flagEnabled("lineNotifyBrandStatus")) {
    const nowDate = now;
    const trials = await prisma.brand.findMany({
      where: {
        status: "TRIAL",
        trialEndsAt: { lt: nowDate },
      },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        trialEndsAt: true,
      },
      take: 80,
    });
    for (const brand of trials) {
      if (effectiveBrandStatus(brand, nowDate) !== "EXPIRED") continue;
      if (
        !(await claimOpsNotify({
          kind: "status_expired",
          brandId: brand.id,
          dayKey,
        }))
      ) {
        continue;
      }
      await pushToUnlocked(
        [
          "แบรนด์หมดช่วงทดลองแล้ว",
          "",
          `ร้าน: ${brand.name}`,
          `รหัส: ${brand.code}`,
        ].join("\n"),
      );
      result.expiredEffective += 1;
    }
  }

  // 3) Inactive onboarding
  if (await flagEnabled("lineNotifyInactiveOnboard")) {
    const inactive = await findInactiveOnboardBrands(now);
    for (const brand of inactive) {
      if (
        !(await claimOpsNotify({
          kind: "inactive_onboard",
          brandId: brand.id,
          dayKey,
        }))
      ) {
        continue;
      }
      await pushToUnlocked(
        [
          "สมัครแล้วยังไม่เริ่มใช้งาน",
          "",
          `ร้าน: ${brand.name}`,
          `รหัส: ${brand.code}`,
          `สมัครเมื่อ: ${brand.createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
          brand.contactPhone
            ? `เบอร์: ${formatThaiPhone(brand.contactPhone)}`
            : null,
          "ยังไม่มีออเดอร์ / สั่งเสียบไม้",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      result.inactive += 1;
    }
  }

  // 4) SMS failure spike
  if (await flagEnabled("lineNotifySystemErrors")) {
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const failed = await prisma.smsSendLog.count({
      where: { status: "FAILED", createdAt: { gte: sixHoursAgo } },
    });
    if (
      failed >= SMS_FAIL_SPIKE &&
      (await claimOpsNotify({ kind: "sms_errors", dayKey }))
    ) {
      await pushToUnlocked(
        [
          "พบข้อผิดพลาดระบบ (SMS)",
          "",
          `SMS ล้มเหลว ${failed} ครั้งใน 6 ชม.ที่ผ่านมา`,
          "ตรวจที่ /admin/sms-logs",
        ].join("\n"),
      );
      result.smsErrors = true;
    }
  }

  // 5) Daily digest
  if (await flagEnabled("lineNotifyDailyOpsSummary")) {
    if (await claimOpsNotify({ kind: "daily_ops_summary", dayKey })) {
      const dash = await getPlatformOpsDashboard(now);
      await pushToUnlocked(
        [
          `สรุปแพลตฟอร์มรายวัน · ${dayKey}`,
          "",
          `สมัครใหม่วันนี้: ${dash.counts.registeredToday}`,
          `ทดลอง: ${dash.counts.trial} · ใช้งาน: ${dash.counts.active}`,
          `หยุดใช้: ${dash.counts.paused} · หมดอายุ: ${dash.counts.expired}`,
          `ทดลองใกล้หมด 3 วัน: ${dash.counts.trialEnding3d} · 1 วัน: ${dash.counts.trialEnding1d}`,
          `สมัครแล้วนิ่ง: ${dash.counts.inactiveOnboard}`,
          `SMS ล้มเหลว 6 ชม.: ${dash.counts.smsFailed6h}`,
          "",
          "ดูรายละเอียดที่ /admin/ops",
        ].join("\n"),
      );
      result.dailySummary = true;
    }
  }

  return result;
}

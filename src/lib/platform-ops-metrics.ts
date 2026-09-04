import { BrandStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { bangkokDateKey } from "@/lib/constants";
import { effectiveBrandStatus } from "@/lib/brand-plan-shared";

const STATUS_LABELS: Record<BrandStatus, string> = {
  TRIAL: "ทดลอง",
  ACTIVE: "ใช้งาน",
  PAUSED: "หยุดใช้",
  EXPIRED: "หมดอายุ",
  DELETED: "ลบแล้ว",
};

export type PlatformOpsBrandRow = {
  id: string;
  code: string;
  name: string;
  status: BrandStatus;
  effectiveStatus: BrandStatus;
  trialEndsAt: string | null;
  createdAt: string;
  daysLeft: number | null;
  contactPhone: string | null;
  branchCount: number;
};

export type PlatformOpsDashboard = {
  asOf: string;
  dayKey: string;
  counts: {
    trial: number;
    active: number;
    paused: number;
    expired: number;
    deleted: number;
    registeredToday: number;
    trialEnding3d: number;
    trialEnding1d: number;
    inactiveOnboard: number;
    smsFailed6h: number;
  };
  trialEnding3d: PlatformOpsBrandRow[];
  trialEnding1d: PlatformOpsBrandRow[];
  paused: PlatformOpsBrandRow[];
  expired: PlatformOpsBrandRow[];
  inactiveOnboard: PlatformOpsBrandRow[];
  registeredToday: PlatformOpsBrandRow[];
};

const LIVE: BrandStatus[] = ["TRIAL", "ACTIVE", "PAUSED", "EXPIRED"];

function addDaysYmd(dateYmd: string, delta: number): string {
  const start = new Date(`${dateYmd}T12:00:00+07:00`);
  start.setTime(start.getTime() + delta * 24 * 60 * 60 * 1000);
  return bangkokDateKey(start);
}

function daysLeftUntil(target: Date, now = new Date()): number {
  const end = new Date(target);
  end.setHours(23, 59, 59, 999);
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

function toRow(
  brand: {
    id: string;
    code: string;
    name: string;
    status: BrandStatus;
    trialEndsAt: Date | null;
    createdAt: Date;
    contactPhone: string | null;
    _count: { branches: number };
  },
  now = new Date(),
): PlatformOpsBrandRow {
  const effectiveStatus = effectiveBrandStatus(brand, now);
  return {
    id: brand.id,
    code: brand.code,
    name: brand.name,
    status: brand.status,
    effectiveStatus,
    trialEndsAt: brand.trialEndsAt?.toISOString() ?? null,
    createdAt: brand.createdAt.toISOString(),
    daysLeft: brand.trialEndsAt ? daysLeftUntil(brand.trialEndsAt, now) : null,
    contactPhone: brand.contactPhone,
    branchCount: brand._count.branches,
  };
}

const brandSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  trialEndsAt: true,
  createdAt: true,
  contactPhone: true,
  _count: { select: { branches: true } },
} satisfies Prisma.BrandSelect;

/** Brands registered 24h–7d ago with no customer/skewer orders yet. */
export async function findInactiveOnboardBrands(now = new Date()) {
  const oldest = new Date(now.getTime() - 7 * 86_400_000);
  const newest = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const candidates = await prisma.brand.findMany({
    where: {
      status: { in: ["TRIAL", "ACTIVE"] },
      createdAt: { gte: oldest, lte: newest },
    },
    select: {
      ...brandSelect,
      branches: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const out: typeof candidates = [];
  for (const brand of candidates) {
    const branchIds = brand.branches.map((b) => b.id);
    if (branchIds.length === 0) {
      out.push(brand);
      continue;
    }
    const [hasOrder, hasSkewer] = await Promise.all([
      prisma.order.findFirst({
        where: { branchId: { in: branchIds } },
        select: { id: true },
      }),
      prisma.skewerOrder.findFirst({
        where: { branchId: { in: branchIds } },
        select: { id: true },
      }),
    ]);
    if (!hasOrder && !hasSkewer) out.push(brand);
  }
  return out;
}

export async function getPlatformOpsDashboard(
  now = new Date(),
): Promise<PlatformOpsDashboard> {
  const dayKey = bangkokDateKey(now);
  const todayStart = new Date(`${dayKey}T00:00:00+07:00`);
  const in3 = addDaysYmd(dayKey, 3);
  const in1 = addDaysYmd(dayKey, 1);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const [
    allLive,
    registeredToday,
    smsFailed6h,
    inactiveRaw,
  ] = await Promise.all([
    prisma.brand.findMany({
      where: { status: { in: LIVE } },
      select: brandSelect,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.brand.findMany({
      where: {
        status: { not: "DELETED" },
        createdAt: { gte: todayStart },
      },
      select: brandSelect,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.smsSendLog.count({
      where: {
        status: "FAILED",
        createdAt: { gte: sixHoursAgo },
      },
    }),
    findInactiveOnboardBrands(now),
  ]);

  let trial = 0;
  let active = 0;
  let paused = 0;
  let expired = 0;
  const trialEnding3d: PlatformOpsBrandRow[] = [];
  const trialEnding1d: PlatformOpsBrandRow[] = [];
  const pausedRows: PlatformOpsBrandRow[] = [];
  const expiredRows: PlatformOpsBrandRow[] = [];

  for (const brand of allLive) {
    const row = toRow(brand, now);
    const eff = row.effectiveStatus;
    if (eff === "TRIAL") trial += 1;
    else if (eff === "ACTIVE") active += 1;
    else if (eff === "PAUSED") {
      paused += 1;
      pausedRows.push(row);
    } else if (eff === "EXPIRED") {
      expired += 1;
      expiredRows.push(row);
    }

    if (
      brand.status === "TRIAL" &&
      brand.trialEndsAt &&
      eff === "TRIAL"
    ) {
      const endKey = bangkokDateKey(brand.trialEndsAt);
      if (endKey >= dayKey && endKey <= in1) {
        trialEnding1d.push(row);
      } else if (endKey > in1 && endKey <= in3) {
        trialEnding3d.push(row);
      }
    }
  }

  const deleted = await prisma.brand.count({ where: { status: "DELETED" } });

  return {
    asOf: now.toISOString(),
    dayKey,
    counts: {
      trial,
      active,
      paused,
      expired,
      deleted,
      registeredToday: registeredToday.length,
      trialEnding3d: trialEnding3d.length,
      trialEnding1d: trialEnding1d.length,
      inactiveOnboard: inactiveRaw.length,
      smsFailed6h,
    },
    trialEnding3d,
    trialEnding1d,
    paused: pausedRows.slice(0, 40),
    expired: expiredRows.slice(0, 40),
    inactiveOnboard: inactiveRaw.map((b) => toRow(b, now)),
    registeredToday: registeredToday.map((b) => toRow(b, now)),
  };
}

export function brandStatusLabelTh(status: BrandStatus): string {
  return STATUS_LABELS[status] ?? status;
}

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  STAFF_MAX_DEVICES,
  STAFF_SESSION_MS,
} from "@/lib/staff-session-limits";

export {
  STAFF_MAX_DEVICES,
  STAFF_LOGIN_UNREGISTERED,
  STAFF_LOGIN_DEVICE_LIMIT,
  staffDeviceIdPattern,
} from "@/lib/staff-session-limits";

export function staffSessionExpiresAt(from = new Date()) {
  return new Date(from.getTime() + STAFF_SESSION_MS);
}

async function pruneStaffAuthSessions(phone: string) {
  const now = new Date();
  await prisma.staffAuthSession.deleteMany({
    where: {
      phone,
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
    },
  });
}

export async function staffDeviceSlotAvailable(
  phone: string,
  deviceId: string,
): Promise<{ ok: true } | { ok: false; activeOthers: number }> {
  await pruneStaffAuthSessions(phone);
  const now = new Date();
  const mine = await prisma.staffAuthSession.findUnique({
    where: { phone_deviceId: { phone, deviceId } },
    select: { revokedAt: true, expiresAt: true },
  });
  if (mine && !mine.revokedAt && mine.expiresAt > now) {
    return { ok: true };
  }
  const activeOthers = await prisma.staffAuthSession.count({
    where: {
      phone,
      revokedAt: null,
      expiresAt: { gt: now },
      NOT: { deviceId },
    },
  });
  if (activeOthers >= STAFF_MAX_DEVICES) {
    return { ok: false, activeOthers };
  }
  return { ok: true };
}

/**
 * Owner → staff bridge: if slots are full, kick the least-recently-used
 * other device so the already-authenticated owner can open the shop floor.
 */
export async function claimStaffDeviceSlotForOwner(
  phone: string,
  deviceId: string,
): Promise<{ ok: true; kickedOldest: boolean }> {
  const slot = await staffDeviceSlotAvailable(phone, deviceId);
  if (slot.ok) return { ok: true, kickedOldest: false };

  const now = new Date();
  const oldest = await prisma.staffAuthSession.findFirst({
    where: {
      phone,
      revokedAt: null,
      expiresAt: { gt: now },
      NOT: { deviceId },
    },
    orderBy: [{ lastSeenAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (oldest) {
    await prisma.staffAuthSession.update({
      where: { id: oldest.id },
      data: { revokedAt: now },
    });
  }
  return { ok: true, kickedOldest: Boolean(oldest) };
}

export async function issueStaffAuthSession(opts: {
  phone: string;
  deviceId: string;
  userAgent?: string | null;
}) {
  const tokenJti = randomUUID();
  const now = new Date();
  const expiresAt = staffSessionExpiresAt(now);
  const userAgent = opts.userAgent?.trim().slice(0, 180) || null;
  await prisma.staffAuthSession.upsert({
    where: { phone_deviceId: { phone: opts.phone, deviceId: opts.deviceId } },
    create: {
      phone: opts.phone,
      deviceId: opts.deviceId,
      tokenJti,
      userAgent,
      lastSeenAt: now,
      expiresAt,
    },
    update: {
      tokenJti,
      userAgent,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
    },
  });
  return { tokenJti, deviceId: opts.deviceId };
}

export async function revokeStaffAuthSessionByJti(tokenJti: string) {
  await prisma.staffAuthSession.updateMany({
    where: { tokenJti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeStaffAuthSessionById(id: string) {
  await prisma.staffAuthSession.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeStaffAuthSessionsForPhone(phone: string) {
  await prisma.staffAuthSession.updateMany({
    where: { phone, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke sessions for a phone only when no staff row still uses it. */
export async function revokeStaffSessionsIfPhoneUnused(phone: string) {
  const remaining = await prisma.staff.count({ where: { phone } });
  if (remaining === 0) {
    await revokeStaffAuthSessionsForPhone(phone);
  }
}

export async function assertStaffAuthSessionLive(opts: {
  jti: string;
  phone: string;
}): Promise<{ touched: boolean }> {
  try {
    const now = new Date();
    const row = await prisma.staffAuthSession.findFirst({
      where: {
        tokenJti: opts.jti,
        phone: opts.phone,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true, lastSeenAt: true },
    });
    if (!row) throw new Error("UNAUTHORIZED");

    // Throttle lastSeen writes so Online/Offline stays useful without hammering DB.
    const STALE_MS = 60_000;
    if (now.getTime() - row.lastSeenAt.getTime() >= STALE_MS) {
      await prisma.staffAuthSession
        .update({
          where: { id: row.id },
          data: {
            lastSeenAt: now,
            // ใช้งานอยู่ = ต่ออายุเซสชันเครื่องอีก 90 วัน (แบบแอป)
            expiresAt: staffSessionExpiresAt(now),
          },
        })
        .catch(() => null);
      return { touched: true };
    }
    return { touched: false };
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (/does not exist|Unknown (field|arg)|staffAuthSession/i.test(msg)) {
      throw new Error("UNAUTHORIZED");
    }
    throw error;
  }
}

import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logAdminActivity } from "@/lib/admin-activity";
import { STAFF_REVOKE_SESSIONS_ACTION } from "@/lib/admin-activity-shared";
import {
  revokeStaffAuthSessionById,
  revokeStaffAuthSessionsForPhone,
} from "@/lib/staff-auth-session";

type Params = { params: Promise<{ id: string }> };

/** Online if lastSeen within 5 minutes */
export const STAFF_ONLINE_MS = 5 * 60 * 1000;

export function describeStaffUserAgent(ua: string | null | undefined): string {
  if (!ua?.trim()) return "ไม่ทราบอุปกรณ์";
  const s = ua.toLowerCase();
  if (s.includes("line")) return "แอป LINE";
  if (s.includes("iphone") || s.includes("ipad")) return "iPhone / iPad";
  if (s.includes("android")) return "Android";
  if (s.includes("mobile")) return "มือถือ";
  if (s.includes("edg/")) return "Edge";
  if (s.includes("chrome")) return "Chrome";
  if (s.includes("safari")) return "Safari";
  if (s.includes("firefox")) return "Firefox";
  return ua.slice(0, 48);
}

/**
 * GET — roster of people (by phone) across all branches of the brand,
 * with roles, OTP verify, live sessions, online/offline.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    await requireBrandAccess(brandId);

    const staffRows = await prisma.staff.findMany({
      where: { branch: { brandId } },
      select: {
        id: true,
        phone: true,
        name: true,
        isActive: true,
        phoneVerifiedAt: true,
        createdAt: true,
        roles: { select: { role: true } },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            kind: true,
            isTest: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const phones = [...new Set(staffRows.map((s) => s.phone))];
    const now = new Date();
    const sessions =
      phones.length === 0
        ? []
        : await prisma.staffAuthSession.findMany({
            where: {
              phone: { in: phones },
              revokedAt: null,
              expiresAt: { gt: now },
            },
            orderBy: { lastSeenAt: "desc" },
          });

    const sessionsByPhone = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const list = sessionsByPhone.get(s.phone) ?? [];
      list.push(s);
      sessionsByPhone.set(s.phone, list);
    }

    type Acc = {
      phone: string;
      name: string | null;
      phoneVerifiedAt: string | null;
      createdAt: string;
      branches: Array<{
        staffId: string;
        branchId: string;
        branchName: string;
        branchCode: string;
        kind: string;
        isTest: boolean;
        isActive: boolean;
        roles: string[];
      }>;
    };

    const byPhone = new Map<string, Acc>();
    for (const row of staffRows) {
      let acc = byPhone.get(row.phone);
      if (!acc) {
        acc = {
          phone: row.phone,
          name: row.name,
          phoneVerifiedAt: row.phoneVerifiedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          branches: [],
        };
        byPhone.set(row.phone, acc);
      }
      if (!acc.name && row.name) acc.name = row.name;
      if (!acc.phoneVerifiedAt && row.phoneVerifiedAt) {
        acc.phoneVerifiedAt = row.phoneVerifiedAt.toISOString();
      }
      acc.branches.push({
        staffId: row.id,
        branchId: row.branch.id,
        branchName: row.branch.name,
        branchCode: row.branch.code ?? "",
        kind: String(row.branch.kind),
        isTest: row.branch.isTest,
        isActive: row.isActive,
        roles: row.roles.map((r) => r.role),
      });
    }

    const people = [...byPhone.values()].map((p) => {
      const live = sessionsByPhone.get(p.phone) ?? [];
      const sessionViews = live.map((s) => {
        const age = now.getTime() - s.lastSeenAt.getTime();
        return {
          id: s.id,
          deviceId: s.deviceId,
          userAgent: s.userAgent,
          deviceLabel: describeStaffUserAgent(s.userAgent),
          lastSeenAt: s.lastSeenAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          online: age <= STAFF_ONLINE_MS,
        };
      });
      const lastSeenAt =
        sessionViews[0]?.lastSeenAt ??
        null;
      const online = sessionViews.some((s) => s.online);
      const activeBranches = p.branches.filter((b) => b.isActive);
      const inactiveBranches = p.branches.filter((b) => !b.isActive);

      return {
        phone: p.phone,
        name: p.name,
        phoneVerifiedAt: p.phoneVerifiedAt,
        otpVerified: Boolean(p.phoneVerifiedAt),
        createdAt: p.createdAt,
        branchCount: p.branches.length,
        activeBranchCount: activeBranches.length,
        inactiveBranchCount: inactiveBranches.length,
        /** overall: active if any branch membership is active */
        usageStatus:
          activeBranches.length > 0
            ? ("active" as const)
            : ("inactive" as const),
        branches: p.branches,
        liveSessionCount: sessionViews.length,
        online,
        lastSeenAt,
        sessions: sessionViews,
      };
    });

    people.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
    });

    return jsonOk({
      onlineWindowMinutes: 5,
      maxDevices: 3,
      people,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  phone: z.string().min(9),
  /** If set, revoke only this session row; otherwise all live sessions for phone */
  sessionId: z.string().min(1).optional(),
});

/** DELETE — revoke one session or all sessions for a staff phone in this brand */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const body = deleteSchema.parse(await request.json());

    const inBrand = await prisma.staff.findFirst({
      where: { phone: body.phone, branch: { brandId } },
      select: { id: true, name: true, phone: true },
    });
    if (!inBrand) {
      return jsonError("ไม่พบพนักงานเบอร์นี้ในแบรนด์", 404);
    }

    if (body.sessionId) {
      const row = await prisma.staffAuthSession.findFirst({
        where: {
          id: body.sessionId,
          phone: body.phone,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (!row) return jsonError("ไม่พบเซสชันนี้ หรือถูกปลดแล้ว", 404);
      await revokeStaffAuthSessionById(row.id);
    } else {
      await revokeStaffAuthSessionsForPhone(body.phone);
    }

    await logAdminActivity(session, {
      action: STAFF_REVOKE_SESSIONS_ACTION,
      summary: body.sessionId
        ? `ปลดเซสชันเครื่องหนึ่งของ ${inBrand.name || inBrand.phone}`
        : `ปลดทุกเครื่องเข้าใช้งาน ${inBrand.name || inBrand.phone}`,
      brandId,
      entityType: "staff",
      entityId: inBrand.id,
      entityName: inBrand.name || inBrand.phone,
      metadata: {
        phone: body.phone,
        sessionId: body.sessionId ?? null,
      },
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

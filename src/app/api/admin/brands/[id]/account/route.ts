import { z } from "zod";
import {
  requireBrandAccess,
  requirePlatformAdmin,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { decryptAdminPassword } from "@/lib/admin-password";
import { logAdminActivity } from "@/lib/admin-activity";
import {
  ensureBrandPrimaryAdmin,
  pickPrimaryAdminId,
} from "@/lib/brand-primary-owner";
import { BRAND_PLAN_PRICES } from "@/lib/brand-plan-shared";
import { normalizePhone } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  primaryAdminId: z.string().min(1).optional(),
  billingNote: z.string().trim().max(2000).nullable().optional(),
  lastPaidAt: z.string().datetime().nullable().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const isPlatform = Boolean(session.isPlatformAdmin);

    await ensureBrandPrimaryAdmin(brandId).catch(() => null);

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        id: true,
        name: true,
        code: true,
        contactPhone: true,
        status: true,
        plan: true,
        maxBranches: true,
        maxStaff: true,
        stockEnabled: true,
        kitchenEnabled: true,
        bbqEnabled: true,
        skewerEnabled: true,
        trialEndsAt: true,
        serviceStartsAt: true,
        primaryAdminId: true,
        billingNote: true,
        lastPaidAt: true,
        nextDueAt: true,
        _count: {
          select: {
            branches: { where: { isTest: false, kind: { not: "WAREHOUSE" } } },
            members: true,
          },
        },
      },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    const members = await prisma.brandMember.findMany({
      where: { brandId },
      include: {
        admin: {
          select: {
            id: true,
            username: true,
            phone: true,
            isPlatformAdmin: true,
            createdAt: true,
            ...(isPlatform ? { passwordEnc: true } : {}),
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const primaryAdminId = pickPrimaryAdminId(
      members,
      brand.primaryAdminId,
    );

    const items = members
      .filter((m) => !m.admin.isPlatformAdmin)
      .map((m) => {
        const recovered = isPlatform
          ? decryptAdminPassword(
              "passwordEnc" in m.admin
                ? (m.admin.passwordEnc as string | null)
                : null,
            )
          : null;
        return {
          membershipId: m.id,
          role: m.role,
          adminId: m.admin.id,
          username: m.admin.username,
          phone: m.admin.phone ?? null,
          createdAt: m.admin.createdAt,
          isPrimary: m.admin.id === primaryAdminId,
          ...(isPlatform
            ? {
                password: recovered,
                passwordRecoverable: Boolean(recovered),
              }
            : {}),
        };
      });

    const primaryMember = items.find((m) => m.isPrimary) ?? items[0] ?? null;
    const ownerPhoneRaw =
      primaryMember?.phone ||
      brand.contactPhone ||
      (primaryMember && /^\d{9,}$/.test(String(primaryMember.username).replace(/\D/g, ""))
        ? primaryMember.username
        : null);
    const ownerPhone = ownerPhoneRaw
      ? normalizePhone(String(ownerPhoneRaw))
      : null;
    const ownerPhoneOk =
      ownerPhone && ownerPhone.length >= 9 ? ownerPhone : null;

    let invoices: Array<{
      id: string;
      number: string;
      title: string;
      amountBaht: number;
      status: string;
      periodLabel: string | null;
      issuedAt: string | null;
      paidAt: string | null;
      note: string | null;
      createdAt: string;
    }> = [];
    try {
      const rows = await prisma.brandInvoice.findMany({
        where: { brandId },
        orderBy: { createdAt: "desc" },
        take: 40,
      });
      invoices = rows.map((row) => ({
        id: row.id,
        number: row.number,
        title: row.title,
        amountBaht: Number(row.amountBaht),
        status: row.status,
        periodLabel: row.periodLabel,
        issuedAt: row.issuedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      }));
    } catch (e) {
      console.error(
        "[brand/account] invoices skipped",
        e instanceof Error ? e.message : e,
      );
    }

    const branches = await prisma.branch.findMany({
      where: { brandId },
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        isTest: true,
        staff: {
          select: {
            id: true,
            phone: true,
            name: true,
            isActive: true,
            roles: { select: { role: true } },
          },
        },
      },
      orderBy: [{ kind: "asc" }, { isTest: "asc" }, { name: "asc" }],
    });

    const uniqueActivePhones = new Set<string>();
    let staffActive = 0;
    let staffInactive = 0;
    let sellerOnly = 0;
    let deliveryOnly = 0;
    let bothRoles = 0;
    let ownerStaffBranchCount = 0;

    const staffByBranch = branches.map((branch) => {
      let active = 0;
      let inactive = 0;
      let sellers = 0;
      let delivery = 0;
      let both = 0;
      let ownerIsStaff = false;
      for (const s of branch.staff) {
        const roles = new Set(s.roles.map((r) => r.role));
        const hasSeller = roles.has("SELLER");
        const hasDelivery = roles.has("DELIVERY");
        if (ownerPhoneOk && s.phone === ownerPhoneOk && s.isActive) {
          ownerIsStaff = true;
        }
        if (s.isActive) {
          active += 1;
          uniqueActivePhones.add(s.phone);
          if (hasSeller && hasDelivery) both += 1;
          else if (hasSeller) sellers += 1;
          else if (hasDelivery) delivery += 1;
        } else {
          inactive += 1;
        }
      }
      if (ownerIsStaff) ownerStaffBranchCount += 1;
      staffActive += active;
      staffInactive += inactive;
      sellerOnly += sellers;
      deliveryOnly += delivery;
      bothRoles += both;
      return {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        kind: branch.kind,
        isTest: branch.isTest,
        staffActive: active,
        staffInactive: inactive,
        sellers,
        delivery,
        both,
        ownerIsStaff,
      };
    });

    return jsonOk({
      brand: {
        ...brand,
        primaryAdminId,
        suggestedPriceBaht: BRAND_PLAN_PRICES[brand.plan] ?? null,
        trialEndsAt: brand.trialEndsAt?.toISOString() ?? null,
        serviceStartsAt: brand.serviceStartsAt?.toISOString() ?? null,
        lastPaidAt: brand.lastPaidAt?.toISOString() ?? null,
        nextDueAt: brand.nextDueAt?.toISOString() ?? null,
      },
      canManage: isPlatform,
      members: items,
      invoices,
      ownerPhone: ownerPhoneOk,
      staffOverview: {
        maxStaff: brand.maxStaff,
        uniqueActivePhones: uniqueActivePhones.size,
        staffActive,
        staffInactive,
        sellerOnly,
        deliveryOnly,
        bothRoles,
        ownerStaffBranchCount,
        ownerIsStaffEverywhere:
          branches.length > 0 && ownerStaffBranchCount === branches.length,
        branches: staffByBranch,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePlatformAdmin();
    const { id: brandId } = await params;
    const body = patchSchema.parse(await request.json());

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, name: true, code: true, primaryAdminId: true },
    });
    if (!brand) return jsonError("ไม่พบแบรนด์", 404);

    if (body.primaryAdminId) {
      const membership = await prisma.brandMember.findUnique({
        where: {
          adminId_brandId: { adminId: body.primaryAdminId, brandId },
        },
        include: { admin: { select: { isPlatformAdmin: true, username: true } } },
      });
      if (!membership || membership.admin.isPlatformAdmin) {
        return jsonError("ตั้งเป็นเจ้าของหลักได้เฉพาะผู้ดูแลในแบรนด์นี้");
      }
      if (membership.role !== "OWNER") {
        await prisma.brandMember.update({
          where: { id: membership.id },
          data: { role: "OWNER" },
        });
      }
    }

    const updated = await prisma.brand.update({
      where: { id: brandId },
      data: {
        ...(body.primaryAdminId !== undefined && {
          primaryAdminId: body.primaryAdminId,
        }),
        ...(body.billingNote !== undefined && {
          billingNote: body.billingNote?.trim() || null,
        }),
        ...(body.lastPaidAt !== undefined && {
          lastPaidAt: body.lastPaidAt ? new Date(body.lastPaidAt) : null,
        }),
        ...(body.nextDueAt !== undefined && {
          nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : null,
        }),
        ...(body.contactPhone !== undefined && {
          contactPhone: body.contactPhone?.replace(/\D/g, "").trim() || null,
        }),
      },
      select: {
        id: true,
        primaryAdminId: true,
        billingNote: true,
        lastPaidAt: true,
        nextDueAt: true,
        contactPhone: true,
      },
    });

    await logAdminActivity(session, {
      action: "brand.account.update",
      summary: `อัปเดตบัญชีเจ้าของแบรนด์ ${brand.name}`,
      brandId: brand.id,
      brandName: brand.name,
      entityType: "brand",
      entityId: brand.id,
      entityName: brand.name,
      metadata: body,
    });

    return jsonOk({
      ok: true,
      brand: {
        ...updated,
        lastPaidAt: updated.lastPaidAt?.toISOString() ?? null,
        nextDueAt: updated.nextDueAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

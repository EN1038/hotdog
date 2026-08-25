import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { normalizePhone } from "@/lib/constants";
import { logAdminActivity } from "@/lib/admin-activity";
import { assertCanCreateStaff } from "@/lib/brand-plan";
import {
  ensureBrandPrimaryAdmin,
  pickPrimaryAdminId,
} from "@/lib/brand-primary-owner";
import { StaffRole } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** empty / omitted = every branch of this brand */
  branchIds: z.array(z.string().min(1)).optional(),
});

async function resolveOwnerPhone(brandId: string): Promise<{
  phone: string;
  name: string | null;
  adminId: string;
} | null> {
  await ensureBrandPrimaryAdmin(brandId).catch(() => null);
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { primaryAdminId: true, contactPhone: true, name: true },
  });
  if (!brand) return null;

  const members = await prisma.brandMember.findMany({
    where: { brandId },
    include: {
      admin: {
        select: {
          id: true,
          phone: true,
          username: true,
          isPlatformAdmin: true,
        },
      },
    },
  });
  const primaryId = pickPrimaryAdminId(members, brand.primaryAdminId);
  const primary = members.find((m) => m.admin.id === primaryId)?.admin;
  if (!primary || primary.isPlatformAdmin) return null;

  const candidates = [
    primary.phone,
    brand.contactPhone,
    /^\d{9,}$/.test(primary.username.replace(/\D/g, ""))
      ? primary.username
      : null,
  ];
  let phone = "";
  for (const c of candidates) {
    if (!c) continue;
    const n = normalizePhone(c);
    if (n.length >= 9) {
      phone = n;
      break;
    }
  }
  if (!phone) return null;

  return {
    phone,
    name: brand.name ? `เจ้าของ · ${brand.name}` : primary.username,
    adminId: primary.id,
  };
}

/**
 * เพิ่มเบอร์เจ้าของหลักเป็นพนักงานสาขา (คนขาย + คนส่ง)
 * — แม่ค้าคนเดียวใช้เบอร์เดียวทั้ง /owner และ /staff
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const owner = await resolveOwnerPhone(brandId);
    if (!owner) {
      return jsonError(
        "ยังไม่มีเบอร์เจ้าของหลัก — ตั้งเบอร์ในบัญชีเจ้าของหรือเบอร์ติดต่อแบรนด์ก่อน",
      );
    }

    const branches = await prisma.branch.findMany({
      where: {
        brandId,
        ...(body.branchIds?.length
          ? { id: { in: body.branchIds } }
          : undefined),
      },
      select: { id: true, name: true, kind: true },
    });
    if (branches.length === 0) {
      return jsonError("ไม่พบสาขาที่จะเพิ่มพนักงาน");
    }

    await assertCanCreateStaff(brandId, { phone: owner.phone });

    const created: string[] = [];
    const skipped: string[] = [];
    const reactivated: string[] = [];

    for (const branch of branches) {
      const roles: StaffRole[] =
        branch.kind === "WAREHOUSE"
          ? ["SELLER"]
          : ["SELLER", "DELIVERY"];

      const existing = await prisma.staff.findFirst({
        where: { branchId: branch.id, phone: owner.phone },
        include: { roles: true },
      });

      if (existing) {
        const have = new Set(existing.roles.map((r) => r.role));
        const missing = roles.filter((r) => !have.has(r));
        await prisma.$transaction(async (tx) => {
          if (!existing.isActive || missing.length > 0) {
            await tx.staff.update({
              where: { id: existing.id },
              data: {
                isActive: true,
                name: existing.name || owner.name,
              },
            });
            if (missing.length > 0) {
              await tx.staffRoleAssignment.createMany({
                data: missing.map((role) => ({
                  staffId: existing.id,
                  role,
                })),
                skipDuplicates: true,
              });
            }
            reactivated.push(branch.name);
          } else {
            skipped.push(branch.name);
          }
        });
        continue;
      }

      await prisma.staff.create({
        data: {
          branchId: branch.id,
          phone: owner.phone,
          name: owner.name,
          isActive: true,
          roles: {
            create: roles.map((role) => ({ role })),
          },
        },
      });
      created.push(branch.name);
    }

    await logAdminActivity(session, {
      action: "brand.owner_as_staff",
      summary: `เพิ่มเจ้าของเป็นพนักงาน (${owner.phone}) · สร้าง ${created.length} · เปิดใช้/เติมสิทธิ์ ${reactivated.length}`,
      brandId,
      entityType: "brand",
      entityId: brandId,
      metadata: {
        phone: owner.phone,
        created,
        reactivated,
        skipped,
      },
    });

    return jsonOk({
      phone: owner.phone,
      created,
      reactivated,
      skipped,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

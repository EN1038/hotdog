import { jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import type { SessionPayload } from "@/lib/auth";
import { readOwnerStashToken } from "@/lib/owner-staff-bridge";

function resolveJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET?.trim();
  const isPlaceholder =
    !raw ||
    raw === "dev-secret" ||
    raw.startsWith("change-this") ||
    raw.length < 16;
  if (process.env.NODE_ENV === "production" && isPlaceholder) {
    throw new Error(
      "JWT_SECRET ต้องตั้งค่าที่เป็นความลับและยาวพอใน production",
    );
  }
  return new TextEncoder().encode(raw || "dev-secret-local-only");
}

export type StockConvertActor = {
  adminId: string | null;
  staffId: string | null;
  label: string;
};

/** Owner stash หรือ BrandMember OWNER/MANAGER ที่เบอร์ตรงกับพนักงาน */
export async function resolveStaffStockConvertActor(opts: {
  branchId: string;
  staffPhone: string;
  staffId?: string | null;
}): Promise<StockConvertActor | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: opts.branchId },
    select: { brandId: true },
  });
  if (!branch?.brandId) return null;

  const stash = await readOwnerStashToken();
  if (stash) {
    try {
      const { payload } = await jwtVerify(stash, resolveJwtSecret());
      const session = payload as unknown as SessionPayload;
      if (session.type === "admin" && session.adminId) {
        const member = await prisma.brandMember.findFirst({
          where: {
            brandId: branch.brandId,
            adminId: session.adminId,
            role: { in: ["OWNER", "MANAGER"] },
          },
          select: { role: true, adminId: true },
        });
        if (member) {
          return {
            adminId: member.adminId,
            staffId: opts.staffId ?? null,
            label: member.role === "OWNER" ? "เจ้าของร้าน" : "ผู้จัดการร้าน",
          };
        }
      }
    } catch {
      /* ignore invalid stash */
    }
  }

  const phone = normalizePhone(opts.staffPhone);
  if (phone.length < 9) return null;

  const member = await prisma.brandMember.findFirst({
    where: {
      brandId: branch.brandId,
      role: { in: ["OWNER", "MANAGER"] },
      admin: {
        OR: [
          { phone },
          { phone: { endsWith: phone.slice(-9) } },
        ],
      },
    },
    select: { role: true, adminId: true },
  });
  if (!member) return null;

  return {
    adminId: member.adminId,
    staffId: opts.staffId ?? null,
    label: member.role === "OWNER" ? "เจ้าของร้าน" : "ผู้จัดการร้าน",
  };
}

export async function staffCanConvertStockSummary(opts: {
  branchId: string;
  staffPhone: string;
}): Promise<boolean> {
  const actor = await resolveStaffStockConvertActor(opts);
  return Boolean(actor);
}

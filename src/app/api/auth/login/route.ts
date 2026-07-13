import bcrypt from "bcryptjs";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/constants";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { StaffRole } from "@prisma/client";

const adminSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const staffSchema = z.object({
  phone: z.string().min(9),
});

const customerSchema = z.object({
  phone: z.string().min(9),
  name: z.string().trim().min(1, "กรุณากรอกชื่อ").optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "admin") {
      const { username, password } = adminSchema.parse(body);
      const admin = await prisma.admin.findUnique({ where: { username } });
      if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
        return jsonError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401);
      }
      await createSession({ type: "admin", adminId: admin.id, username });
      return jsonOk({ ok: true });
    }

    if (type === "staff") {
      const { phone } = staffSchema.parse(body);
      const normalized = normalizePhone(phone);
      const staff = await prisma.staff.findUnique({
        where: { phone: normalized },
        include: {
          branch: true,
          roles: true,
        },
      });
      if (!staff || !staff.isActive) {
        return jsonError("ไม่พบเบอร์โทรนี้ในระบบ", 401);
      }

      const dbRoles = new Set(staff.roles.map((r) => r.role));
      const roles =
        dbRoles.has(StaffRole.SELLER) && dbRoles.has(StaffRole.DELIVERY)
          ? ["BOTH" as const]
          : dbRoles.has(StaffRole.SELLER)
            ? ["SELLER" as const]
            : dbRoles.has(StaffRole.DELIVERY)
              ? ["DELIVERY" as const]
              : [];

      if (roles.length === 0) {
        return jsonError("ไม่พบสิทธิ์การใช้งาน", 401);
      }
      await createSession({
        type: "staff",
        staffPhone: normalized,
        branchId: staff.branchId,
        staffRoles: roles,
        branchName: staff.branch.name,
      });
      return jsonOk({ ok: true, branchName: staff.branch.name, roles });
    }

    if (type === "customer") {
      const { phone, name } = customerSchema.parse(body);
      const normalized = normalizePhone(phone);
      const existing = await prisma.customer.findUnique({
        where: { phone: normalized },
      });

      if (!existing && !name) {
        return jsonOk({ needsName: true });
      }

      const finalName = name ?? existing!.name;
      const customer = await prisma.customer.upsert({
        where: { phone: normalized },
        update: { name: finalName },
        create: { phone: normalized, name: finalName },
      });
      await createSession({
        type: "customer",
        customerPhone: normalized,
        customerId: customer.id,
        customerName: finalName ?? undefined,
      });
      return jsonOk({ ok: true, name: finalName, phone: normalized });
    }

    return jsonError("ประเภทการเข้าสู่ระบบไม่ถูกต้อง");
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/admin-access";
import { ShiftGateError } from "@/lib/branch-shift";
import {
  BrandInactiveError,
  BrandLimitError,
} from "@/lib/brand-plan-shared";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

const ZOD_FIELD_LABELS: Record<string, string> = {
  code: "รหัสแบรนด์",
  name: "ชื่อแบรนด์",
  adminUsername: "ไอดีผู้ดูแล",
  adminPassword: "รหัสผ่านผู้ดูแล",
  username: "ไอดีเข้าใช้",
  password: "รหัสผ่าน",
  phone: "เบอร์โทร",
  branchCode: "รหัสสาขา",
  itemCode: "รหัสสินค้า",
  color: "สี",
};

function formatZodError(error: ZodError): string {
  const parts = error.issues.slice(0, 3).map((issue) => {
    const key = issue.path.map(String).join(".");
    const label = (key && ZOD_FIELD_LABELS[key]) || key;
    const detail = issue.message?.trim() || "ไม่ถูกต้อง";
    return label ? `${label}: ${detail}` : detail;
  });
  if (parts.length === 0) {
    return "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
  }
  return parts.join(" · ");
}

export function handleApiError(error: unknown) {
  if (error instanceof ForbiddenError) {
    return jsonError(error.message || "ไม่มีสิทธิ์เข้าถึง", 403);
  }

  if (error instanceof BrandInactiveError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof BrandLimitError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof ShiftGateError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const fields = Array.isArray(error.meta?.target)
        ? (error.meta.target as string[]).join(", ")
        : "";
      if (fields.includes("phone")) {
        return jsonError("เบอร์โทรนี้ถูกใช้ในระบบแล้ว", 409);
      }
      return jsonError("ข้อมูลซ้ำในระบบ", 409);
    }
    if (error.code === "P2025") {
      return jsonError("ไม่พบข้อมูล", 404);
    }
    if (error.code === "P2021") {
      return jsonError(
        "ตารางโปรโมชั่นยังไม่พร้อม — รัน prisma db push หรือ migrate deploy",
        503,
      );
    }
    if (error.code === "P2022") {
      return jsonError(
        "โครงสร้างฐานข้อมูลยังไม่อัปเดต — รัน prisma migrate deploy แล้วรีสตาร์ท dev server",
        503,
      );
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error("[api] Prisma validation", error.message);
    const raw = error.message;
    const msg =
      /Unknown (field|argument|arg)/i.test(raw)
        ? "ระบบอัปเดตแล้ว — รีเฟรชหน้านี้หรือปิดแอปแล้วเปิดใหม่"
        : raw.includes("imageUrl")
          ? "ระบบยังอัปเดตรูปไม่ครบ — ลองใหม่หรือแจ้งแอดมิน"
          : raw.includes("unitPriceBaht") ||
              raw.includes("deliveryInfo") ||
              raw.includes("shippingCostBaht") ||
              raw.includes("deliveredAt") ||
              raw.includes("deliveredOn")
            ? "ระบบอัปเดตแล้ว — รีสตาร์ท dev server แล้วรีเฟรชหน้านี้"
            : raw.includes("status") ||
              raw.includes("trialEndsAt") ||
              raw.includes("BrandPlan") ||
              raw.includes("cancelledAt")
            ? "ระบบอัปเดตแล้ว — ปิดแอปแล้วเปิดใหม่ หรือรีเฟรชหน้านี้"
            : "บันทึกไม่สำเร็จ — ตรวจข้อมูลแล้วลองใหม่";
    return jsonError(msg, 400);
  }

  if (error instanceof ZodError) {
    return jsonError(formatZodError(error), 400);
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return jsonError("หมดเวลาเข้าใช้ — กรุณาเข้าสู่ระบบใหม่", 401);
    }
    if (error.message === "NOT_FOUND") {
      return jsonError("ไม่พบรายการนี้", 404);
    }
    if (error.message === "FORBIDDEN") {
      return jsonError("ไม่มีสิทธิ์ทำรายการนี้", 403);
    }
    const raw = error.message;
    if (
      raw.includes("queueNumber") ||
      raw.includes("queueBusinessDate") ||
      (raw.includes("Order") && raw.includes("does not exist"))
    ) {
      return jsonError(
        "ระบบคิวยังไม่พร้อม — แจ้งแอดมินให้อัปเดต แล้วลองใหม่",
        503,
      );
    }
    if (raw.includes("expired transaction") || raw.includes("interactive transaction timeout")) {
      console.error("[api] Prisma transaction timeout", raw);
      return jsonError(
        "บันทึกนานเกินไป — ลองใหม่อีกครั้ง",
        408,
      );
    }
    if (raw.includes("Can't reach database server") || raw.includes("ECONNREFUSED") || raw.includes("P1001")) {
      console.error("[api] database unreachable", raw);
      return jsonError(
        "เชื่อมต่อไม่ได้ — ตรวจเน็ตแล้วลองใหม่",
        503,
      );
    }
    if (
      (raw.includes("column") && raw.includes("does not exist")) ||
      raw.includes("cancelledAt") ||
      raw.includes("cancelNote")
    ) {
      console.error("[api] stock history schema", raw);
      return jsonError(
        "โครงสร้างประวัติสต๊อกยังไม่อัปเดต — รีเฟรชหน้าแล้วลองใหม่ (ระบบจะเพิ่มคอลัมน์ให้อัตโนมัติ)",
        503,
      );
    }
    if (raw.includes("Invalid `") || raw.length > 180) {
      console.error("[api] Prisma/runtime", raw);
      return jsonError("บันทึกไม่สำเร็จ กรุณาลองใหม่", 400);
    }
    return jsonError(error.message, 400);
  }
  return jsonError("เกิดข้อผิดพลาด", 500);
}

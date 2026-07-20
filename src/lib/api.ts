import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/admin-access";

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
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error("[api] Prisma validation", error.message);
    const msg = error.message.includes("imageUrl")
      ? "ฐานข้อมูลยังไม่มีคอลัมน์รูปโปร — รัน prisma db push แล้วรีสตาร์ท dev server"
      : "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
    return jsonError(msg, 400);
  }

  if (error instanceof ZodError) {
    return jsonError(formatZodError(error), 400);
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return jsonError("ไม่มีสิทธิ์เข้าถึง", 401);
    }
    if (error.message === "NOT_FOUND") {
      return jsonError("ไม่พบข้อมูล", 404);
    }
    if (error.message === "FORBIDDEN") {
      return jsonError("ไม่มีสิทธิ์เข้าถึง", 403);
    }
    if (error.message.includes("Invalid `") || error.message.length > 180) {
      return jsonError("บันทึกไม่สำเร็จ กรุณาลองใหม่", 400);
    }
    return jsonError(error.message, 400);
  }
  return jsonError("เกิดข้อผิดพลาด", 500);
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/admin-access";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error("[api] Prisma validation", error.message);
    return jsonError("ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", 400);
  }

  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "ZodError"
  ) {
    return jsonError("ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", 400);
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

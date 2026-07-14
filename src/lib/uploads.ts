import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
export const UPLOAD_PUBLIC_PREFIX = "/uploads";

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function assertAllowedImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ GIF");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("ไฟล์ใหญ่เกิน 5MB");
  }
}

export async function saveUploadedImage(file: File): Promise<string> {
  assertAllowedImage(file);

  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, name), buffer);

  return `${UPLOAD_PUBLIC_PREFIX}/${name}`;
}

import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  isS3Configured,
  normalizeUploadFolder,
  type UploadFolder,
  uploadBufferToS3,
} from "@/lib/s3";

export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
export const UPLOAD_PUBLIC_PREFIX = "/uploads";

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXT_BY_KIND: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

const MIME_BY_KIND: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

type ImageKind = keyof typeof EXT_BY_KIND;

export type SaveUploadedImageOptions = {
  shopCode?: string | null;
  folder?: string | null;
};

function detectImageKind(buffer: Buffer): ImageKind | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  if (
    buffer.length >= 6 &&
    buffer.subarray(0, 3).toString("ascii") === "GIF" &&
    (buffer.subarray(3, 6).toString("ascii") === "87a" ||
      buffer.subarray(3, 6).toString("ascii") === "89a")
  ) {
    return "gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function assertAllowedImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ GIF");
  }
  if (file.size <= 0) {
    throw new Error("ไม่พบไฟล์รูปภาพ");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("ไฟล์ใหญ่เกิน 5MB");
  }
}

export async function saveUploadedImage(
  file: File,
  options: SaveUploadedImageOptions = {},
): Promise<string> {
  assertAllowedImage(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = detectImageKind(buffer);
  if (!kind) {
    throw new Error("ไฟล์ไม่ใช่รูปภาพที่รองรับ (ตรวจลายเซ็นไฟล์ไม่ผ่าน)");
  }

  const ext = EXT_BY_KIND[kind];
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const folder = normalizeUploadFolder(options.folder) as UploadFolder;

  if (isS3Configured()) {
    return uploadBufferToS3({
      buffer,
      contentType: MIME_BY_KIND[kind],
      shopCode: options.shopCode,
      folder,
      fileName: name,
    });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `${UPLOAD_PUBLIC_PREFIX}/${name}`;
}

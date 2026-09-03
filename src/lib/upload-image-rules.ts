/** Client-safe image upload rules (no Node APIs). */

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** Returns a user-facing Thai error, or null if OK. */
export function validateImageFileForUpload(file: File): string | null {
  if (!file || file.size <= 0) {
    return "ไม่พบไฟล์รูป กรุณาเลือกใหม่อีกครั้ง";
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return "รูปใหญ่เกินไป กรุณาเลือกรูปที่เล็กกว่า 5MB";
  }

  const mimeOk = ALLOWED_IMAGE_MIME_TYPES.has(file.type);
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase() ?? ""
    : "";
  const extOk = ext ? ALLOWED_EXT.has(ext) : false;

  if (!mimeOk && !extOk) {
    return "ไฟล์นี้ใช้ไม่ได้ ลองเลือกรูป JPG หรือ PNG จากมือถือ";
  }

  return null;
}

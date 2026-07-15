import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import bcrypt from "bcryptjs";

const KEY_SALT = "skillsale-admin-password-v1";

function getKey() {
  const secret = process.env.JWT_SECRET?.trim() || "dev-insecure-jwt-secret";
  return scryptSync(secret, KEY_SALT, 32);
}

/** Encrypt plaintext password so platform admins can recover it later. */
export function encryptAdminPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptAdminPassword(payload: string | null | undefined): string | null {
  if (!payload?.trim()) return null;
  try {
    const buf = Buffer.from(payload, "base64url");
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

export async function hashAndSealPassword(plain: string) {
  const passwordHash = await bcrypt.hash(plain, 10);
  const passwordEnc = encryptAdminPassword(plain);
  return { passwordHash, passwordEnc };
}

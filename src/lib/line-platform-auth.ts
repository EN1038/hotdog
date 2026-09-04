import { prisma } from "@/lib/db";

/** Fixed chat password for SkillSale platform OA (backend ops). */
export const PLATFORM_LINE_UNLOCK_PASSWORD = "อร่อยจังเลย";

export const PLATFORM_LINE_PASSWORD_PROMPT =
  "ระบบ SkillSale POS หลังบ้าน\nโปรดบอกรหัสผ่าน";

export const PLATFORM_LINE_PASSWORD_WRONG = "รหัสผ่านผิด";

export const PLATFORM_LINE_UNLOCKED_REPLY = [
  "รหัสผ่านถูกต้อง — เข้าใช้งานหลังบ้านได้แล้ว",
  "",
  "ฟังก์ชันที่ใช้ได้:",
  "· รับแจ้งเมื่อมีคนสมัครเป็นเจ้าของร้าน (เปิด/ปิดได้ที่แอดมินแพลตฟอร์ม)",
  "· แก้ไข / ลบออเดอร์ผ่านเมนู LINE (หลังเชื่อมบัญชีแอดมินแพลตฟอร์ม)",
  "",
  "เชื่อมสิทธิ์แก้ไข-ลบ: เข้า /admin/line-connect สร้างรหัส แล้วส่งรหัส 6 หลักมาที่นี่",
  "พิมพ์ ช่วยเหลือ เพื่อดูคำสั่ง",
].join("\n");

export async function isPlatformLineUnlocked(
  lineUserId: string,
): Promise<boolean> {
  const row = await prisma.platformLineUser.findUnique({
    where: { lineUserId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function unlockPlatformLineUser(lineUserId: string) {
  return prisma.platformLineUser.upsert({
    where: { lineUserId },
    create: { lineUserId },
    update: { unlockedAt: new Date() },
  });
}

export function normalizePlatformLinePassword(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function isPlatformLinePasswordMatch(raw: string): boolean {
  return (
    normalizePlatformLinePassword(raw) === PLATFORM_LINE_UNLOCK_PASSWORD
  );
}

/**
 * Handle password unlock for platform OA.
 * Returns a reply when the message was consumed (prompt / wrong / unlocked).
 * Returns null when already unlocked and message is not a password attempt
 * that should be swallowed.
 */
export async function tryHandlePlatformLineUnlock(
  lineUserId: string,
  rawText: string,
): Promise<{ handled: true; reply: string } | { handled: false }> {
  const unlocked = await isPlatformLineUnlocked(lineUserId);
  const text = normalizePlatformLinePassword(rawText);

  if (!unlocked) {
    if (isPlatformLinePasswordMatch(text)) {
      await unlockPlatformLineUser(lineUserId);
      return { handled: true, reply: PLATFORM_LINE_UNLOCKED_REPLY };
    }
    if (!text) {
      return { handled: true, reply: PLATFORM_LINE_PASSWORD_PROMPT };
    }
    return { handled: true, reply: PLATFORM_LINE_PASSWORD_WRONG };
  }

  // Already unlocked — ignore accidental re-entry of the password (no reply spam)
  if (isPlatformLinePasswordMatch(text)) {
    return { handled: true, reply: "" };
  }

  return { handled: false };
}

export async function listUnlockedPlatformLineUserIds(): Promise<string[]> {
  const rows = await prisma.platformLineUser.findMany({
    select: { lineUserId: true },
  });
  return rows.map((r) => r.lineUserId);
}

import { prisma } from "@/lib/db";
import { formatThaiPhone } from "@/lib/constants";
import { isLineMessagingReady, linePushText } from "@/lib/line";
import { listUnlockedPlatformLineUserIds } from "@/lib/line-platform-auth";

export type OwnerRegisterLineNotifyInput = {
  shopName: string;
  brandCode: string;
  phone: string;
  branchId: string;
};

/** Push to unlocked platform OA users when a new owner self-registers. */
export async function notifyPlatformOwnerRegistration(
  input: OwnerRegisterLineNotifyInput,
): Promise<void> {
  try {
    if (!(await isLineMessagingReady())) return;

    const settings = await prisma.siteSettings.findUnique({
      where: { id: "default" },
      select: { lineNotifyOwnerRegistration: true },
    });
    if (!settings?.lineNotifyOwnerRegistration) return;

    const recipients = await listUnlockedPlatformLineUserIds();
    if (recipients.length === 0) return;

    const text = [
      "มีคนสมัครเข้าใช้งาน Owner ใหม่",
      "",
      `ร้าน: ${input.shopName}`,
      `รหัสแบรนด์: ${input.brandCode}`,
      `เบอร์: ${formatThaiPhone(input.phone)}`,
    ].join("\n");

    await Promise.all(
      recipients.map((lineUserId) =>
        linePushText(lineUserId, text).catch((e) => {
          console.error(
            "[line] owner-register notify failed",
            lineUserId,
            e instanceof Error ? e.message : e,
          );
        }),
      ),
    );
  } catch (error) {
    console.error(
      "[line] notifyPlatformOwnerRegistration failed",
      error instanceof Error ? error.message : error,
    );
  }
}

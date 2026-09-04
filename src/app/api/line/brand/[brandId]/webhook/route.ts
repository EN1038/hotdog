import { NextResponse } from "next/server";
import {
  BRAND_LINE_FOLLOW_REPLY,
  brandLineReplyText,
  getBrandLineCredentials,
  tryLinkBrandAdminByLinkCode,
  tryLinkBrandStaffByPhone,
  verifyBrandLineWebhookSignature,
} from "@/lib/brand-line";
import { normalizePhone } from "@/lib/constants";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

export const runtime = "nodejs";

type Params = { params: Promise<{ brandId: string }> };

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

type LineWebhookBody = { events?: LineEvent[] };

/**
 * Brand Official Account webhook — staff phone link + owner 6-digit link.
 * Separate from platform OA at /api/line/webhook.
 */
export async function POST(request: Request, { params }: Params) {
  await ensureProdSchemaCompat().catch(() => null);
  const { brandId } = await params;

  const creds = await getBrandLineCredentials(brandId);
  if (!creds) {
    return NextResponse.json({ error: "LINE not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (
    !verifyBrandLineWebhookSignature(
      rawBody,
      signature,
      creds.channelSecret,
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const event of body.events ?? []) {
    const userId = event.source?.userId;
    if (!userId || !event.replyToken) continue;

    if (event.type === "follow") {
      await brandLineReplyText(brandId, event.replyToken, BRAND_LINE_FOLLOW_REPLY);
      continue;
    }

    if (
      event.type !== "message" ||
      event.message?.type !== "text" ||
      !event.message.text
    ) {
      continue;
    }

    const text = event.message.text;
    const digits = normalizePhone(text);
    if (digits.length >= 9 && digits.length <= 12) {
      const result = await tryLinkBrandStaffByPhone(brandId, userId, text);
      await brandLineReplyText(brandId, event.replyToken, result.reply);
      continue;
    }

    const codeDigits = text.replace(/\D/g, "");
    if (codeDigits.length === 6) {
      const result = await tryLinkBrandAdminByLinkCode(brandId, userId, text);
      await brandLineReplyText(brandId, event.replyToken, result.reply);
      continue;
    }

    // Quiet for unrecognized messages after link instructions on follow
  }

  return NextResponse.json({ ok: true });
}

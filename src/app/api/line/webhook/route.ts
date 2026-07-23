import { NextResponse } from "next/server";
import {
  getLineCredentials,
  LINE_FOLLOW_REPLY,
  lineReplyText,
  tryLinkLineAccountFromMessage,
  verifyLineWebhookSignature,
} from "@/lib/line";

export const runtime = "nodejs";

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

type LineWebhookBody = {
  events?: LineEvent[];
};

/**
 * LINE Messaging API webhook.
 * Staff link by phone; brand admins link by username.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const creds = await getLineCredentials();
  if (!creds) {
    return NextResponse.json({ error: "LINE not configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-line-signature");
  if (!verifyLineWebhookSignature(rawBody, signature, creds.channelSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = body.events ?? [];
  for (const event of events) {
    const userId = event.source?.userId;
    if (!userId) continue;

    if (event.type === "follow" && event.replyToken) {
      await lineReplyText(event.replyToken, LINE_FOLLOW_REPLY);
      continue;
    }

    if (
      event.type === "message" &&
      event.message?.type === "text" &&
      event.message.text &&
      event.replyToken
    ) {
      const { reply } = await tryLinkLineAccountFromMessage(
        userId,
        event.message.text,
      );
      await lineReplyText(event.replyToken, reply);
    }
  }

  return NextResponse.json({ ok: true });
}

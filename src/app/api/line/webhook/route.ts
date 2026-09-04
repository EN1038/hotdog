import { NextResponse } from "next/server";
import {
  getLineCredentials,
  lineReplyText,
  tryLinkAdminByLinkCodeMessage,
  verifyLineWebhookSignature,
} from "@/lib/line";
import { tryHandleLineAdminPostback } from "@/lib/line-admin-menu";
import { tryHandleLineOrderDelete } from "@/lib/line-order-delete";
import { tryHandleLineOrderEdit } from "@/lib/line-order-edit";
import {
  PLATFORM_LINE_PASSWORD_PROMPT,
  isPlatformLineUnlocked,
  tryHandlePlatformLineUnlock,
} from "@/lib/line-platform-auth";
import type { LineReplyPayload } from "@/lib/line-postback";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

export const runtime = "nodejs";

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

type LineWebhookBody = {
  events?: LineEvent[];
};

async function replyPayload(replyToken: string, payload: LineReplyPayload) {
  await lineReplyText(replyToken, payload.text, {
    quickReply: payload.quickReply,
  });
}

/**
 * LINE Messaging API webhook — SkillSale platform backend OA.
 * Password gate unlocks ops functions; edit/delete still need platform admin link.
 */
export async function POST(request: Request) {
  await ensureProdSchemaCompat().catch(() => null);

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
      await lineReplyText(event.replyToken, PLATFORM_LINE_PASSWORD_PROMPT);
      continue;
    }

    const unlocked = await isPlatformLineUnlocked(userId);

    if (event.type === "postback" && event.replyToken && event.postback?.data) {
      if (!unlocked) {
        await lineReplyText(event.replyToken, PLATFORM_LINE_PASSWORD_PROMPT);
        continue;
      }
      const result = await tryHandleLineAdminPostback(
        userId,
        event.postback.data,
      );
      if (result.handled) {
        await replyPayload(event.replyToken, result.reply);
      }
      continue;
    }

    if (
      event.type === "message" &&
      event.message?.type === "text" &&
      event.message.text &&
      event.replyToken
    ) {
      const unlock = await tryHandlePlatformLineUnlock(
        userId,
        event.message.text,
      );
      if (unlock.handled) {
        if (unlock.reply) {
          await lineReplyText(event.replyToken, unlock.reply);
        }
        continue;
      }

      if (!unlocked) {
        await lineReplyText(event.replyToken, PLATFORM_LINE_PASSWORD_PROMPT);
        continue;
      }

      const deleteResult = await tryHandleLineOrderDelete(
        userId,
        event.message.text,
      );
      if (deleteResult.handled) {
        await replyPayload(event.replyToken, deleteResult.reply);
        continue;
      }

      const editResult = await tryHandleLineOrderEdit(
        userId,
        event.message.text,
      );
      if (editResult.handled) {
        await replyPayload(event.replyToken, editResult.reply);
        continue;
      }

      if (/^ช่วยเหลือ$/i.test(event.message.text.trim())) {
        const helpResult = await tryHandleLineAdminPostback(
          userId,
          "admin:help",
        );
        if (helpResult.handled) {
          await replyPayload(event.replyToken, helpResult.reply);
          continue;
        }
      }

      // Platform admin link by 6-digit code (edit/delete identity)
      const digits = event.message.text.replace(/\D/g, "");
      if (digits.length === 6) {
        const { reply } = await tryLinkAdminByLinkCodeMessage(
          userId,
          event.message.text,
        );
        await lineReplyText(event.replyToken, reply);
        continue;
      }

      // Unlocked but unrecognized text — stay quiet (no catch-all auto-reply)
    }
  }

  return NextResponse.json({ ok: true });
}

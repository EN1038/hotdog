import { NextResponse } from "next/server";
import {
  isDemoDailyActivityEnabled,
  runDemoActivityTick,
  runDemoDailyActivityBatch,
} from "@/lib/malawaiwai-demo-daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() || "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  const q = url.searchParams.get("secret")?.trim();
  return Boolean(q && q === secret);
}

async function handle(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDemoDailyActivityEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "MALAWAIWAI_DEMO_DAILY_ENABLED is not set to 1",
    });
  }

  const url = new URL(request.url);
  const dateKey = url.searchParams.get("date")?.trim() || undefined;
  const batch = url.searchParams.get("batch") === "1";
  const force = url.searchParams.get("force") === "1";

  const result = batch
    ? await runDemoDailyActivityBatch({
        dateKey,
        skipIfRan: !force,
      })
    : await runDemoActivityTick({ dateKey });

  return NextResponse.json({ ok: true, ...result });
}

/** Vercel Cron — drip demo sales every ~15 min during 10:00–23:00 Bangkok. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

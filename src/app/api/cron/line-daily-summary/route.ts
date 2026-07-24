import { NextResponse } from "next/server";
import { closeShiftsPastCutoff } from "@/lib/branch-shift";
import { runLineDailySummaries } from "@/lib/line-daily-summary";

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

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId")?.trim() || undefined;
  const operatingDay = url.searchParams.get("date")?.trim() || undefined;
  const force = url.searchParams.get("force") === "1";

  // Close stale open shifts at operating-day cutoff before day summaries.
  const autoClose = await closeShiftsPastCutoff();

  const result = await runLineDailySummaries({
    branchId,
    operatingDay,
    force,
  });

  return NextResponse.json({
    ok: true,
    autoClose,
    ...result,
  });
}

/** External scheduler / Vercel Cron: every few minutes after cutoffs. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

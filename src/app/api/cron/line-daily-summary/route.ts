import { NextResponse } from "next/server";
import { closeShiftsPastMidnight } from "@/lib/branch-shift";

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

  // Close shifts from previous Bangkok calendar days; LINE summary fires on each close.
  const autoClose = await closeShiftsPastMidnight();

  return NextResponse.json({
    ok: true,
    autoClose,
  });
}

/** External scheduler / Vercel Cron: every few minutes (midnight auto-close). */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

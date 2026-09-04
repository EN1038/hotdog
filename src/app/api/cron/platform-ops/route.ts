import { NextResponse } from "next/server";
import { runPlatformOpsLineJobs } from "@/lib/line-platform-ops-notify";
import { ensureProdSchemaCompat } from "@/lib/schema-compat";

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
  await ensureProdSchemaCompat().catch(() => null);
  const result = await runPlatformOpsLineJobs();
  return NextResponse.json({ ok: true, result });
}

/** External scheduler: recommend 1–2×/day (morning Bangkok). */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

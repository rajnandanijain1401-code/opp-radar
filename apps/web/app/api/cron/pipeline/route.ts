import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const report = await runPipeline({ trigger: "cron" });
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err instanceof Error ? err.message : err) },
      { status: 500 },
    );
  }
}

// Vercel Cron issues GET; the GitHub Actions fallback uses POST.
export const GET = handle;
export const POST = handle;

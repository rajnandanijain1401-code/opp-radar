import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";

/** RFC 8058 one-click: mail clients POST "List-Unsubscribe=One-Click" to this URL. */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const res = await unsubscribeByToken(token);
  return res.ok
    ? new NextResponse("Unsubscribed", { status: 200 })
    : new NextResponse("Invalid token", { status: 400 });
}

/** A human clicking the header link lands on the confirmation page. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, req.url));
}

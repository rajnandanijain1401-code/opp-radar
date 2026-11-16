import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyToken } from "@opp-radar/core";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { resubscribeByToken, unsubscribeByToken } from "@/lib/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

async function confirm(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const res = await unsubscribeByToken(token);
  redirect(
    res.ok ? `/unsubscribe?token=${encodeURIComponent(token)}&done=1` : "/unsubscribe?invalid=1",
  );
}

async function undo(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  await resubscribeByToken(token);
  redirect(`/unsubscribe?token=${encodeURIComponent(token)}&resubscribed=1`);
}

/**
 * One click, no login. The page itself does not change anything on GET (email security scanners
 * prefetch links); the single button below does. Mail clients use RFC 8058 one-click POST instead.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; resubscribed?: string; invalid?: string }>;
}) {
  const sp = await searchParams;
  const valid = !!sp.token && !!verifyToken(sp.token, env().RADAR_LINK_SECRET);
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {!valid || sp.invalid ? (
        <>
          <h1 className="font-display text-4xl">Link not valid</h1>
          <p className="mt-3 text-muted">
            This unsubscribe link is invalid. You can manage email from your dashboard.
          </p>
        </>
      ) : sp.done ? (
        <>
          <h1 className="font-display text-4xl">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-muted">We won&apos;t email you again. Changed your mind?</p>
          <form action={undo} className="mt-6">
            <input type="hidden" name="token" value={sp.token} />
            <Button variant="outline">Resubscribe</Button>
          </form>
        </>
      ) : sp.resubscribed ? (
        <>
          <h1 className="font-display text-4xl">Welcome back</h1>
          <p className="mt-3 text-muted">Your alerts are back on.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-4xl">Unsubscribe from OppRadar?</h1>
          <p className="mt-3 text-muted">
            One click and all OppRadar emails stop. No sign-in needed.
          </p>
          <form action={confirm} className="mt-6">
            <input type="hidden" name="token" value={sp.token} />
            <Button variant="accent" size="lg" data-testid="unsubscribe-button">
              Unsubscribe
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

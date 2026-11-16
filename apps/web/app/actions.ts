"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { getIp } from "@/lib/utils";

const EmailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** Send a magic link. Rate limited per IP and per email. */
export async function requestMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = EmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Please enter a valid email address." };
  const ip = getIp(await headers());
  const okIp = await rateLimit(`signup:ip:${ip}`, 10, 3600);
  const okEmail = await rateLimit(`signup:email:${parsed.data.email}`, 5, 3600);
  if (!okIp || !okEmail)
    return { error: "Too many sign-in attempts. Please try again in an hour." };
  // Throws a redirect to /signup/check on success.
  await signIn("resend", { email: parsed.data.email, redirectTo: "/onboarding" });
  return { ok: true };
}

/** Pro waitlist (used while BILLING_ENABLED=false). */
export async function joinWaitlist(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = EmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Please enter a valid email address." };
  const ip = getIp(await headers());
  if (!(await rateLimit(`waitlist:ip:${ip}`, 10, 3600)))
    return { error: "Too many requests, try later." };
  await db
    .insert(schema.waitlist)
    .values({ email: parsed.data.email, source: "pro" })
    .onConflictDoNothing();
  return { ok: true, message: "You're on the Pro waitlist. We'll email you when it opens." };
}

export async function goToSignup() {
  redirect("/signup");
}

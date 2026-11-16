import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { renderMagicLink } from "@opp-radar/emails";
import { db, schema } from "@/lib/db";
import { rememberMagicLink, sendEmail } from "@/lib/mailer";

/**
 * Auth.js v5: passwordless email magic links. In production the link is sent via Resend;
 * in dev the console provider prints it (and saves it to .data/last-magic-link.json).
 * Clicking the link verifies the address, which doubles as our double opt-in.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "dev-only-auth-secret-change-me"),
  trustHost: true,
  session: { strategy: "database", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/signup", verifyRequest: "/signup/check", error: "/signup" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY ?? "unused-in-dev",
      from: process.env.EMAIL_FROM ?? "OppRadar <radar@localhost>",
      maxAge: 24 * 3600,
      async sendVerificationRequest({ identifier, url }) {
        rememberMagicLink(identifier, url);
        const host = new URL(url).host;
        const rendered = await renderMagicLink({ url, host });
        await sendEmail({ to: identifier, ...rendered, category: "magic_link" });
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const row = (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0];
  return row ?? null;
}

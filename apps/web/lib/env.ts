import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  RADAR_PUBLIC_URL: z.string().default("http://localhost:3000"),
  RADAR_LINK_SECRET: z.string().default("dev-only-link-secret-change-me"),
  RADAR_EMAIL_PROVIDER: z.enum(["resend", "smtp", "console", "memory"]).optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default("OppRadar <radar@localhost>"),
  RADAR_PHYSICAL_ADDRESS: z
    .string()
    .default("OppRadar, add your postal address via RADAR_PHYSICAL_ADDRESS"),
  CRON_SECRET: z.string().optional(),
  ADMIN_EMAILS: z.string().default(""),
  BILLING_ENABLED: bool,
  ANTHROPIC_API_KEY: z.string().optional(),
  RADAR_MODEL: z.string().optional(),
  LLM_DAILY_TOKEN_BUDGET: z.coerce.number().default(400_000),
  RADAR_CONTACT_EMAIL: z.string().optional(),
  RADAR_FIXTURES: bool,
  NEXT_PUBLIC_GITHUB_REPO: z.string().default("rajnandanijain1401-code/opp-radar"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= EnvSchema.parse(process.env));
}

export function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email?: string | null): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

# Deploy the hosted app (Vercel + Neon + Resend + Razorpay)

This is the path for running OppRadar as a website with sign-ups. For a personal radar you do not
need any of this: use GitHub Actions mode or Claude mode (see the README).

Time: about 45 minutes. Cost: free tiers work to start (Vercel Pro is needed for 15-minute crons,
or use the free GitHub Actions fallback below).

## 1. Database: Neon

1. Create a project at [neon.tech](https://neon.tech), region close to your users (for India: Singapore).
2. Copy the **pooled** connection string (`...-pooler...`, with `sslmode=require`). This is `DATABASE_URL`.
3. Apply migrations and seed from your machine:

   ```bash
   cd apps/web
   DATABASE_URL="postgres://..." pnpm db:migrate
   DATABASE_URL="postgres://..." pnpm db:seed   # optional: demo signals so the landing page is not empty
   ```

Supabase works the same way: use the "Transaction pooler" connection string.

## 2. Email: Resend + your domain (SPF, DKIM, DMARC)

1. Create an account at [resend.com](https://resend.com) and add your sending domain, ideally a
   subdomain such as `mail.yourdomain.com` so marketing mail and product mail do not share reputation.
2. Add the DNS records Resend shows you at your DNS provider:
   - **SPF**: a `TXT` record on the bounce subdomain Resend gives you (it includes `include:amazonses.com`).
     If you already have an SPF record on that exact name, merge the `include:` into it; a name may have
     only one SPF record.
   - **DKIM**: the `TXT` record named like `resend._domainkey.mail.yourdomain.com`.
   - **MX** for the bounce subdomain (for bounce handling).
3. Add **DMARC** yourself (Resend does not create it). Start in monitoring mode, then tighten:

   ```
   _dmarc.yourdomain.com  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; adkim=s; aspf=s"
   ```

   After a couple of weeks of clean reports, move to `p=quarantine`, then `p=reject`.

4. Wait for Resend to show the domain as verified, then create an API key with "sending" access.
   This is `RESEND_API_KEY`. Set `EMAIL_FROM="OppRadar <radar@mail.yourdomain.com>"`.
5. Webhook for bounces and complaints: in Resend, add a webhook to
   `https://YOUR_DOMAIN/api/webhooks/resend` with events `email.bounced`, `email.complained`
   (and optionally `email.delivered`, `email.opened`). Copy the signing secret (`whsec_...`) into
   `RESEND_WEBHOOK_SECRET`. Hard bounces and complaints automatically suppress the address.

OppRadar already sends `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
headers, which Gmail and Yahoo require for bulk senders.

## 3. App: Vercel

1. Import the GitHub repo in [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `apps/web`. Framework preset: Next.js. Vercel detects pnpm and the
   workspace automatically; keep "Include files outside the root directory" enabled.
3. Add environment variables (Production and Preview):

| Variable                                                | Value                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`                                          | Neon pooled connection string                                  |
| `AUTH_SECRET`                                           | `openssl rand -base64 32`                                      |
| `RADAR_PUBLIC_URL`                                      | `https://yourdomain.com`                                       |
| `RADAR_LINK_SECRET`                                     | `openssl rand -hex 32` (signs unsubscribe and feedback links)  |
| `CRON_SECRET`                                           | `openssl rand -hex 32`                                         |
| `RADAR_EMAIL_PROVIDER`                                  | `resend`                                                       |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` | from step 2                                                    |
| `RADAR_PHYSICAL_ADDRESS`                                | your postal address (shown in every email footer)              |
| `ADMIN_EMAILS`                                          | your email, comma separated                                    |
| `RADAR_CONTACT_EMAIL`                                   | a real address; SEC EDGAR requires it in the User-Agent        |
| `ANTHROPIC_API_KEY`                                     | optional, enables LLM classification                           |
| `RADAR_MODEL`                                           | optional, default `claude-haiku-5-5`                           |
| `LLM_DAILY_TOKEN_BUDGET`                                | optional, default `400000`                                     |
| `BILLING_ENABLED`                                       | `false` to start (everyone gets Pro, pricing shows a waitlist) |

4. Deploy, then add your custom domain in Vercel.
5. Crons: `apps/web/vercel.json` schedules `/api/cron/pipeline` every 15 minutes and
   `/api/cron/digest` hourly. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
   On the Hobby plan crons can run only once a day, so use the fallback below instead.

### Cron fallback via GitHub Actions

`.github/workflows/hosted-cron.yml` calls both endpoints on schedule. Enable it with:

- repository secrets `OPPRADAR_URL` (`https://yourdomain.com`) and `CRON_SECRET` (same value as Vercel)
- repository variable `HOSTED_CRON_ENABLED=true`

## 4. Payments: Razorpay (India) and Stripe (international)

Keep `BILLING_ENABLED=false` until both are tested.

### Razorpay

1. In the Razorpay dashboard, complete KYC and enable **Subscriptions**.
2. Create a **Plan**: monthly, INR 299. Copy its id (`plan_...`) into `RAZORPAY_PLAN_ID`.
3. Settings, API Keys: generate keys, set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
4. Settings, Webhooks: add `https://yourdomain.com/api/webhooks/razorpay` with a secret of your
   choice (`RAZORPAY_WEBHOOK_SECRET`) and the events `subscription.authenticated`,
   `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`,
   `subscription.cancelled`, `subscription.completed`.
5. Test with test-mode keys first (Razorpay test cards and UPI ids), then swap to live keys.

### Stripe

1. Create a Product "OppRadar Pro" with a recurring monthly USD 5 price; copy `price_...` into `STRIPE_PRICE_ID`.
2. `STRIPE_SECRET_KEY` from Developers, API keys.
3. Developers, Webhooks: endpoint `https://yourdomain.com/api/webhooks/stripe` with events
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Test with `4242 4242 4242 4242` in test mode, then switch to live keys.

Then set `BILLING_ENABLED=true` and redeploy. Free users get the weekly digest and 1 profile;
Pro unlocks instant alerts, daily digests, open roles, openers, 3 profiles and 25 watchlist companies.

## 5. After launch

- Open `/admin` (signed in with an `ADMIN_EMAILS` address): source health, last pipeline runs,
  signals per day, deliveries and bounce/complaint rates, plus "Run pipeline now".
- Keep the complaint rate under 0.1% and the bounce rate under 2%.
- Run `pnpm radar sources check --all` occasionally; feeds move.

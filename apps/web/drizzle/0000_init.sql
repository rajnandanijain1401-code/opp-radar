CREATE TABLE "accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" text,
	"signal_id" text NOT NULL,
	"cluster_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"email" text,
	"user_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "enrich_cache" (
	"company_key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"rating" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"date" text PRIMARY KEY NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"budget_alerted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"mode" text NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"error" text,
	"trigger" text DEFAULT 'cron' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'My radar' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_clusters" (
	"cluster_id" text PRIMARY KEY NOT NULL,
	"company_key" text NOT NULL,
	"event_type" text NOT NULL,
	"first_published_at" timestamp with time zone NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"canonical_url" text NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_quality" integer DEFAULT 50 NOT NULL,
	"title" text NOT NULL,
	"title_key" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"company_name" text NOT NULL,
	"company_domain" text,
	"event_type" text NOT NULL,
	"amount_usd" double precision,
	"round" text,
	"investors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"geographies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roles_likely" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hiring_likelihood" integer NOT NULL,
	"hiring_reason" text NOT NULL,
	"summary" text NOT NULL,
	"suggested_action" text NOT NULL,
	"outreach_opener" text NOT NULL,
	"confidence" real NOT NULL,
	"cluster_id" text NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"classifier" text DEFAULT 'rules' NOT NULL,
	"other_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_roles_count" integer,
	"open_roles_url" text,
	"open_roles_sample" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signals_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"source_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer NOT NULL,
	"items_fetched" integer NOT NULL,
	"error" text,
	"blocked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"quality" integer DEFAULT 60 NOT NULL,
	"last_items_at" timestamp with time zone,
	"last_error" text,
	"unhealthy_notified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"provider_customer_id" text,
	"plan" text DEFAULT 'pro' NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"suppressed_reason" text,
	"last_instant_at" timestamp with time zone,
	"last_digest_at" timestamp with time zone,
	"instant_count_date" text,
	"instant_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'pro' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_user_cluster_uq" ON "deliveries" USING btree ("user_id","cluster_id");--> statement-breakpoint
CREATE INDEX "deliveries_sent_idx" ON "deliveries" USING btree ("sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_user_signal_uq" ON "feedback" USING btree ("user_id","signal_id");--> statement-breakpoint
CREATE INDEX "profiles_user_idx" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signals_published_idx" ON "signals" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "signals_cluster_idx" ON "signals" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "signals_title_key_idx" ON "signals" USING btree ("title_key");--> statement-breakpoint
CREATE INDEX "source_runs_source_idx" ON "source_runs" USING btree ("source_id","started_at");
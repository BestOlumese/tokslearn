CREATE TYPE "public"."attribution_source" AS ENUM('instructor_referral', 'instructor_coupon', 'platform_organic', 'platform_paid');--> statement-breakpoint
CREATE TYPE "public"."cart_item_type" AS ENUM('course', 'bundle');--> statement-breakpoint
CREATE TYPE "public"."coupon_applies_to" AS ENUM('course', 'bundle', 'instructor_all', 'all');--> statement-breakpoint
CREATE TYPE "public"."coupon_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."earning_status" AS ENUM('pending', 'available', 'paid', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('active', 'refunded', 'non_refundable');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'failed', 'abandoned', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."referral_target" AS ENUM('course', 'profile');--> statement-breakpoint
CREATE TYPE "public"."consumption_kind" AS ENUM('video_progress', 'resource_download', 'certificate_issued', 'exam_started', 'assignment_submitted');--> statement-breakpoint
CREATE TYPE "public"."enrollment_source" AS ENUM('purchase', 'free', 'bundle', 'coupon_100', 'admin_grant', 'subscription', 'organization');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'revoked', 'expired', 'completed');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_type" AS ENUM('asset', 'liability', 'revenue', 'expense', 'equity');--> statement-breakpoint
CREATE TYPE "public"."commission_scope" AS ENUM('default', 'instructor', 'promo');--> statement-breakpoint
CREATE TYPE "public"."journal_kind" AS ENUM('sale', 'refund', 'release', 'payout', 'payout_reversal', 'chargeback', 'settlement', 'fee', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."journal_line_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TABLE "attributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"anonymous_id" text,
	"source" "attribution_source" NOT NULL,
	"referral_link_id" uuid,
	"instructor_id" uuid,
	"utm" jsonb,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cart_id" uuid NOT NULL,
	"item_type" "cart_item_type" NOT NULL,
	"item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"coupon_code" text,
	CONSTRAINT "carts_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instructor_id" uuid,
	"code" text NOT NULL,
	"kind" "coupon_kind" NOT NULL,
	"percent_off" smallint,
	"amount_off_kobo" bigint,
	"applies_to" "coupon_applies_to" NOT NULL,
	"target_id" uuid,
	"max_redemptions" integer,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_value_matches_kind" CHECK (("coupons"."kind" = 'percent' and "coupons"."percent_off" between 1 and 100 and "coupons"."amount_off_kobo" is null)
        or ("coupons"."kind" = 'fixed' and "coupons"."amount_off_kobo" > 0 and "coupons"."percent_off" is null)),
	CONSTRAINT "coupons_code_upper" CHECK ("coupons"."code" = upper("coupons"."code")),
	CONSTRAINT "coupons_target" CHECK (("coupons"."applies_to" in ('course', 'bundle')) = ("coupons"."target_id" is not null)),
	CONSTRAINT "coupons_all_is_platform" CHECK ("coupons"."applies_to" <> 'all' or "coupons"."instructor_id" is null),
	CONSTRAINT "coupons_limits" CHECK ("coupons"."per_user_limit" >= 1 and coalesce("coupons"."max_redemptions", 1) >= 1)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_type" "cart_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"bundle_id" uuid,
	"instructor_id" uuid NOT NULL,
	"course_title_snapshot" text NOT NULL,
	"list_price_kobo" bigint NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"net_price_kobo" bigint NOT NULL,
	"attribution_source" "attribution_source" NOT NULL,
	"referral_link_id" uuid,
	"commission_rule_id" uuid,
	"platform_rate_bps" integer NOT NULL,
	"instructor_share_kobo" bigint,
	"platform_share_kobo" bigint,
	"gateway_fee_share_kobo" bigint,
	"refund_policy_days_snapshot" smallint NOT NULL,
	"refundable_until" timestamp with time zone,
	"status" "order_item_status" DEFAULT 'active' NOT NULL,
	"earning_status" "earning_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "order_items_amounts" CHECK ("order_items"."list_price_kobo" >= 0 and "order_items"."discount_kobo" >= 0 and "order_items"."net_price_kobo" = "order_items"."list_price_kobo" - "order_items"."discount_kobo"),
	CONSTRAINT "order_items_rate" CHECK ("order_items"."platform_rate_bps" between 0 and 10000),
	CONSTRAINT "order_items_shares" CHECK ("order_items"."instructor_share_kobo" is null or ("order_items"."instructor_share_kobo" >= 0 and "order_items"."platform_share_kobo" >= 0 and "order_items"."gateway_fee_share_kobo" >= 0))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"public_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal_kobo" bigint NOT NULL,
	"discount_kobo" bigint DEFAULT 0 NOT NULL,
	"total_kobo" bigint NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text,
	"coupon_id" uuid,
	"payment_channel" text,
	"gateway_fee_kobo" bigint,
	"initialized_at" timestamp with time zone,
	"provider_access_code" text,
	"authorization_url" text,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"idempotency_key" text,
	CONSTRAINT "orders_publicId_unique" UNIQUE("public_id"),
	CONSTRAINT "orders_providerReference_unique" UNIQUE("provider_reference"),
	CONSTRAINT "orders_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_amounts" CHECK ("orders"."subtotal_kobo" >= 0 and "orders"."discount_kobo" >= 0 and "orders"."total_kobo" = "orders"."subtotal_kobo" - "orders"."discount_kobo"),
	CONSTRAINT "orders_fee_non_negative" CHECK (coalesce("orders"."gateway_fee_kobo", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "referral_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"code" text NOT NULL,
	"target_type" "referral_target" NOT NULL,
	"target_id" uuid,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "referral_links_code_unique" UNIQUE("code"),
	CONSTRAINT "referral_links_one_per_target" UNIQUE NULLS NOT DISTINCT("instructor_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumption_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"order_item_id" uuid,
	"kind" "consumption_kind" NOT NULL,
	"ref_id" uuid,
	"value" numeric(12, 2),
	"occurred_at" timestamp with time zone NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"source" "enrollment_source" NOT NULL,
	"order_item_id" uuid,
	"cohort_id" uuid,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"access_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"progress_pct" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "enrollments_progress" CHECK ("enrollments"."progress_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "account_balances" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"balance_kobo" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scope" "commission_scope" NOT NULL,
	"instructor_id" uuid,
	"source" "attribution_source" NOT NULL,
	"platform_rate_bps" integer NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"note" text,
	"created_by" uuid,
	CONSTRAINT "commission_rules_rate" CHECK ("commission_rules"."platform_rate_bps" between 0 and 10000),
	CONSTRAINT "commission_rules_instructor" CHECK (("commission_rules"."scope" = 'default') = ("commission_rules"."instructor_id" is null)),
	CONSTRAINT "commission_rules_window" CHECK ("commission_rules"."ends_at" is null or "commission_rules"."ends_at" > "commission_rules"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"public_id" text NOT NULL,
	"kind" "journal_kind" NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"description" text,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"posted_by_kind" text NOT NULL,
	"posted_by_id" uuid,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "journal_entries_publicId_unique" UNIQUE("public_id"),
	CONSTRAINT "journal_entries_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "journal_line_direction" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	CONSTRAINT "journal_lines_positive" CHECK ("journal_lines"."amount_kobo" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"type" "ledger_account_type" NOT NULL,
	"owner_id" uuid,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	CONSTRAINT "ledger_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_referral_link_id_referral_links_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_referral_link_id_referral_links_id_fk" FOREIGN KEY ("referral_link_id") REFERENCES "public"."referral_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_events" ADD CONSTRAINT "consumption_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_events" ADD CONSTRAINT "consumption_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_events" ADD CONSTRAINT "consumption_events_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_id_user_id_fk" FOREIGN KEY ("posted_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attributions_user_id_created_at_index" ON "attributions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "attributions_anonymous_id_created_at_index" ON "attributions" USING btree ("anonymous_id","created_at");--> statement-breakpoint
CREATE INDEX "attributions_referral_link_id_index" ON "attributions" USING btree ("referral_link_id");--> statement-breakpoint
CREATE INDEX "attributions_instructor_id_index" ON "attributions" USING btree ("instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_id_item_type_item_id_index" ON "cart_items" USING btree ("cart_id","item_type","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_id_order_id_index" ON "coupon_redemptions" USING btree ("coupon_id","order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_id_user_id_index" ON "coupon_redemptions" USING btree ("coupon_id","user_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_order_id_index" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_id_index" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coupons_instructor_id_created_at_index" ON "coupons" USING btree ("instructor_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_index" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_course_id_index" ON "order_items" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "order_items_bundle_id_index" ON "order_items" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "order_items_referral_link_id_index" ON "order_items" USING btree ("referral_link_id");--> statement-breakpoint
CREATE INDEX "order_items_instructor_id_earning_status_index" ON "order_items" USING btree ("instructor_id","earning_status");--> statement-breakpoint
CREATE INDEX "order_items_release_due" ON "order_items" USING btree ("refundable_until") WHERE "order_items"."earning_status" = 'pending';--> statement-breakpoint
CREATE INDEX "orders_user_id_created_at_index" ON "orders" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_status_created_at_index" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_coupon_id_index" ON "orders" USING btree ("coupon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_id_index" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payment_events_processed_at_index" ON "payment_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "referral_links_instructor_id_index" ON "referral_links" USING btree ("instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_user_id_course_id_index" ON "wishlist_items" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_course_id_index" ON "wishlist_items" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "consumption_events_user_id_course_id_occurred_at_index" ON "consumption_events" USING btree ("user_id","course_id","occurred_at");--> statement-breakpoint
CREATE INDEX "consumption_events_order_item_id_index" ON "consumption_events" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "consumption_events_course_id_index" ON "consumption_events" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_user_id_course_id_index" ON "enrollments" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "enrollments_course_id_status_index" ON "enrollments" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "enrollments_user_id_last_accessed_at_index" ON "enrollments" USING btree ("user_id","last_accessed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "enrollments_order_item_id_index" ON "enrollments" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "commission_rules_scope_source_starts_at_index" ON "commission_rules" USING btree ("scope","source","starts_at");--> statement-breakpoint
CREATE INDEX "commission_rules_instructor_id_source_index" ON "commission_rules" USING btree ("instructor_id","source");--> statement-breakpoint
CREATE INDEX "commission_rules_created_by_index" ON "commission_rules" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_rules_one_default" ON "commission_rules" USING btree ("source") WHERE "commission_rules"."scope" = 'default' and "commission_rules"."ends_at" is null;--> statement-breakpoint
CREATE INDEX "journal_entries_ref_type_ref_id_index" ON "journal_entries" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "journal_entries_kind_posted_at_index" ON "journal_entries" USING btree ("kind","posted_at");--> statement-breakpoint
CREATE INDEX "journal_entries_posted_by_id_index" ON "journal_entries" USING btree ("posted_by_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_id_index" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_id_created_at_index" ON "journal_lines" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_accounts_owner_id_index" ON "ledger_accounts" USING btree ("owner_id");--> statement-breakpoint
-- The ledger is append-only (docs/08 §5): corrections are new adjustment entries, never edits.
CREATE FUNCTION "ledger_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are append-only (% on %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "journal_entries_append_only" BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION "ledger_append_only"();--> statement-breakpoint
CREATE TRIGGER "journal_lines_append_only" BEFORE UPDATE OR DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION "ledger_append_only"();

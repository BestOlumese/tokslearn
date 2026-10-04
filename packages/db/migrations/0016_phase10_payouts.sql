CREATE TYPE "public"."payout_hold_reason" AS ENUM('no_payout_account', 'payout_account_in_review', 'payout_account_on_hold', 'kyc_not_verified', 'two_factor_off', 'suspended', 'below_minimum', 'finance_hold');--> statement-breakpoint
CREATE TYPE "public"."payout_item_status" AS ENUM('queued', 'held', 'sending', 'sent', 'success', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."payout_run_status" AS ENUM('draft', 'approved', 'processing', 'completed', 'partially_failed');--> statement-breakpoint
CREATE TABLE "payout_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"payout_account_id" uuid,
	"amount_kobo" bigint NOT NULL,
	"netted_kobo" bigint DEFAULT 0 NOT NULL,
	"status" "payout_item_status" DEFAULT 'queued' NOT NULL,
	"hold_reason" "payout_hold_reason",
	"anomalies" text[] DEFAULT '{}'::text[] NOT NULL,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"reference" text,
	"transfer_code" text,
	"fee_kobo" bigint,
	"failure_reason" text,
	"sent_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "payout_items_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "payout_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"public_id" text NOT NULL,
	"month" char(7) NOT NULL,
	"pay_on" timestamp with time zone NOT NULL,
	"status" "payout_run_status" DEFAULT 'draft' NOT NULL,
	"total_kobo" bigint DEFAULT 0 NOT NULL,
	"cosign_required" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"cosigned_by" uuid,
	"cosigned_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "payout_runs_publicId_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "payout_item_id" uuid;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_run_id_payout_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payout_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payout_account_id_payout_accounts_id_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_runs" ADD CONSTRAINT "payout_runs_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_runs" ADD CONSTRAINT "payout_runs_cosigned_by_user_id_fk" FOREIGN KEY ("cosigned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_items_run_id_instructor_id_index" ON "payout_items" USING btree ("run_id","instructor_id");--> statement-breakpoint
CREATE INDEX "payout_items_instructor_id_created_at_index" ON "payout_items" USING btree ("instructor_id","created_at");--> statement-breakpoint
CREATE INDEX "payout_items_status_sent_at_index" ON "payout_items" USING btree ("status","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_runs_month_index" ON "payout_runs" USING btree ("month");--> statement-breakpoint
CREATE INDEX "payout_runs_status_pay_on_index" ON "payout_runs" USING btree ("status","pay_on");--> statement-breakpoint
CREATE INDEX "order_items_payout_item_id_index" ON "order_items" USING btree ("payout_item_id");
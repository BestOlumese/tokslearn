CREATE TYPE "public"."non_refundable_reason" AS ENUM('no_refund_policy', 'important_download', 'content_consumed', 'exam_started', 'certificate_issued');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('not_as_described', 'quality', 'technical', 'duplicate', 'changed_mind', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('under_review', 'approved', 'denied', 'processing', 'processed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."order_item_status" ADD VALUE 'refund_pending';--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"public_id" text NOT NULL,
	"order_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"reason_code" "refund_reason" NOT NULL,
	"reason_text" text,
	"status" "refund_status" NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"eligibility_snapshot" jsonb NOT NULL,
	"appeal_text" text,
	"appealed_at" timestamp with time zone,
	"provider_refund_id" text,
	"sent_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	CONSTRAINT "refund_requests_publicId_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "vat_kobo" bigint;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "non_refundable_reason" "non_refundable_reason";--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_order_item_id_index" ON "refund_requests" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "refund_requests_user_id_created_at_index" ON "refund_requests" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "refund_requests_order_id_index" ON "refund_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refund_requests_decided_by_index" ON "refund_requests" USING btree ("decided_by");--> statement-breakpoint
CREATE INDEX "refund_requests_queue_idx" ON "refund_requests" USING btree ("created_at") WHERE "refund_requests"."status" = 'under_review';--> statement-breakpoint
CREATE INDEX "refund_requests_processing_idx" ON "refund_requests" USING btree ("sent_at") WHERE "refund_requests"."status" = 'processing';
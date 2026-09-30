CREATE TYPE "public"."cohort_status" AS ENUM('draft', 'open', 'cancelled');--> statement-breakpoint
CREATE TABLE "cohort_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"enroll_opens_at" timestamp with time zone,
	"enroll_closes_at" timestamp with time zone,
	"capacity" integer,
	"status" "cohort_status" DEFAULT 'draft' NOT NULL,
	"timezone" text DEFAULT 'Africa/Lagos' NOT NULL,
	CONSTRAINT "cohorts_capacity_positive" CHECK ("cohorts"."capacity" is null or "cohorts"."capacity" > 0),
	CONSTRAINT "cohorts_ends_after_start" CHECK ("cohorts"."ends_at" > "cohorts"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "cohort_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "cohort_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "cohort_based" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course_search" ADD COLUMN "cohort_based" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course_search" ADD COLUMN "next_cohort_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cohort_holds" ADD CONSTRAINT "cohort_holds_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_holds" ADD CONSTRAINT "cohort_holds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_holds_order_id_cohort_id_index" ON "cohort_holds" USING btree ("order_id","cohort_id");--> statement-breakpoint
CREATE INDEX "cohort_holds_cohort_id_expires_at_index" ON "cohort_holds" USING btree ("cohort_id","expires_at");--> statement-breakpoint
CREATE INDEX "cohort_holds_user_id_index" ON "cohort_holds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cohorts_course_id_starts_at_index" ON "cohorts" USING btree ("course_id","starts_at");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_cohort_id_index" ON "cart_items" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "order_items_cohort_id_index" ON "order_items" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "enrollments_cohort_id_status_index" ON "enrollments" USING btree ("cohort_id","status");--> statement-breakpoint
CREATE INDEX "course_search_next_cohort_idx" ON "course_search" USING btree ("next_cohort_starts_at") WHERE "course_search"."next_cohort_starts_at" is not null;
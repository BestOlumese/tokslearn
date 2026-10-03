CREATE TYPE "public"."review_report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TABLE "course_rating_stats" (
	"course_id" uuid PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"avg" numeric(3, 2),
	"stars1" integer DEFAULT 0 NOT NULL,
	"stars2" integer DEFAULT 0 NOT NULL,
	"stars3" integer DEFAULT 0 NOT NULL,
	"stars4" integer DEFAULT 0 NOT NULL,
	"stars5" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "review_report_status" DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_votes" (
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_votes_review_id_user_id_pk" PRIMARY KEY("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text,
	"status" "review_status" DEFAULT 'visible' NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"instructor_reply" text,
	"replied_at" timestamp with time zone,
	"replied_by" uuid,
	"edited_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "course_rating_stats" ADD CONSTRAINT "course_rating_stats_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_replied_by_user_id_fk" FOREIGN KEY ("replied_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_user_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_reports_review_id_reporter_id_index" ON "review_reports" USING btree ("review_id","reporter_id");--> statement-breakpoint
CREATE INDEX "review_reports_open_idx" ON "review_reports" USING btree ("created_at") WHERE "review_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "review_reports_reporter_id_index" ON "review_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "review_reports_handled_by_index" ON "review_reports" USING btree ("handled_by");--> statement-breakpoint
CREATE INDEX "review_votes_user_id_index" ON "review_votes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_course_id_user_id_index" ON "reviews" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "reviews_course_visible_idx" ON "reviews" USING btree ("course_id","created_at" DESC NULLS LAST) WHERE "reviews"."status" = 'visible' and "reviews"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "reviews_user_id_index" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reviews_enrollment_id_index" ON "reviews" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "reviews_replied_by_index" ON "reviews" USING btree ("replied_by");--> statement-breakpoint
CREATE INDEX "reviews_hidden_by_index" ON "reviews" USING btree ("hidden_by");
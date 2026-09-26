CREATE TYPE "public"."bundle_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."certificate_mode" AS ENUM('none', 'completion', 'exam', 'external');--> statement-breakpoint
CREATE TYPE "public"."course_level" AS ENUM('beginner', 'intermediate', 'advanced', 'all');--> statement-breakpoint
CREATE TYPE "public"."course_staff_role" AS ENUM('co_instructor', 'teaching_assistant');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'in_review', 'changes_requested', 'published', 'unlisted', 'archived');--> statement-breakpoint
CREATE TYPE "public"."drip_mode" AS ENUM('none', 'fixed_dates', 'after_enrollment', 'cohort_relative');--> statement-breakpoint
CREATE TYPE "public"."lesson_type" AS ENUM('video', 'article', 'quiz', 'assignment', 'live', 'resource');--> statement-breakpoint
CREATE TYPE "public"."course_revision_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."instructor_application_status" AS ENUM('draft', 'submitted', 'in_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."kyc_method" AS ENUM('bvn', 'nin');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'verified', 'failed', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."payout_account_status" AS ENUM('active', 'pending_review', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "webhook_events" (
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
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bundle_courses" (
	"bundle_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_courses_bundle_id_course_id_pk" PRIMARY KEY("bundle_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "bundles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price_kobo" bigint NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"status" "bundle_status" DEFAULT 'draft' NOT NULL,
	CONSTRAINT "bundles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "bundles_price_non_negative" CHECK ("bundles"."price_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "course_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "course_revision_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description_doc" jsonb,
	"description_html" text,
	"outcomes" text[] DEFAULT '{}'::text[] NOT NULL,
	"requirements" text[] DEFAULT '{}'::text[] NOT NULL,
	"cover_file_id" uuid,
	"promo_video_id" uuid,
	"category_id" uuid,
	"level" "course_level" DEFAULT 'all' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"price_kobo" bigint DEFAULT 0 NOT NULL,
	"compare_at_kobo" bigint,
	"refund_policy_days" smallint DEFAULT 7 NOT NULL,
	"certificate_mode" "certificate_mode" DEFAULT 'none' NOT NULL,
	"snapshot" jsonb,
	"review_checklist" jsonb,
	"review_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "course_revisions_refund_policy_days" CHECK ("course_revisions"."refund_policy_days" in (0, 3, 7, 14)),
	CONSTRAINT "course_revisions_price_non_negative" CHECK ("course_revisions"."price_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "course_staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "course_staff_role" DEFAULT 'teaching_assistant' NOT NULL,
	"invited_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_tags" (
	"course_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_tags_course_id_tag_id_pk" PRIMARY KEY("course_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"live_revision_id" uuid,
	"draft_revision_id" uuid,
	"category_id" uuid,
	"level" "course_level" DEFAULT 'all' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"price_kobo" bigint DEFAULT 0 NOT NULL,
	"compare_at_kobo" bigint,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"is_free" boolean GENERATED ALWAYS AS (price_kobo = 0) STORED NOT NULL,
	"refund_policy_days" smallint DEFAULT 7 NOT NULL,
	"certificate_mode" "certificate_mode" DEFAULT 'none' NOT NULL,
	"drip_mode" "drip_mode" DEFAULT 'none' NOT NULL,
	"completion_threshold_pct" smallint DEFAULT 90 NOT NULL,
	"subscription_opt_in" boolean DEFAULT false NOT NULL,
	"drm_required" boolean DEFAULT false NOT NULL,
	"total_duration_sec" integer DEFAULT 0 NOT NULL,
	"lesson_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug"),
	CONSTRAINT "courses_refund_policy_days" CHECK ("courses"."refund_policy_days" in (0, 3, 7, 14)),
	CONSTRAINT "courses_price_non_negative" CHECK ("courses"."price_kobo" >= 0),
	CONSTRAINT "courses_completion_threshold" CHECK ("courses"."completion_threshold_pct" between 50 and 100)
);
--> statement-breakpoint
CREATE TABLE "lesson_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_important" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"type" "lesson_type" NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"is_preview" boolean DEFAULT false NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"video_asset_id" uuid,
	"article_doc" jsonb,
	"article_html" text,
	"quiz_id" uuid,
	"assignment_id" uuid,
	"live_session_id" uuid,
	"drip_offset_days" smallint,
	"drip_date" timestamp with time zone,
	"live_since" timestamp with time zone,
	"removal_requested_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"live_since" timestamp with time zone,
	"removal_requested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "instructor_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "instructor_application_status" DEFAULT 'draft' NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"expertise" text,
	"sample_url" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewer_id" uuid,
	"decision_reason" text,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "instructor_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"commission_override_id" uuid,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructor_profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "kyc_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'dojah' NOT NULL,
	"method" "kyc_method" NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" text,
	"matched_name" text,
	"face_match_score" numeric(5, 2),
	"raw_result_redacted" jsonb,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number_last4" char(4) NOT NULL,
	"account_name" text NOT NULL,
	"paystack_recipient_code" text,
	"status" "payout_account_status" NOT NULL,
	"name_match_score" numeric(4, 3),
	"payouts_allowed_from" timestamp with time zone NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "video_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" text DEFAULT 'bunny' NOT NULL,
	"library_id" text NOT NULL,
	"provider_video_id" text NOT NULL,
	"status" "video_status" DEFAULT 'uploading' NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_sec" integer,
	"width" integer,
	"height" integer,
	"thumbnail_url" text,
	"drm_enabled" boolean DEFAULT false NOT NULL,
	"captions" jsonb,
	"error" text,
	"ready_at" timestamp with time zone,
	CONSTRAINT "video_assets_providerVideoId_unique" UNIQUE("provider_video_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_courses" ADD CONSTRAINT "bundle_courses_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_courses" ADD CONSTRAINT "bundle_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_revisions" ADD CONSTRAINT "course_revisions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_revisions" ADD CONSTRAINT "course_revisions_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_revisions" ADD CONSTRAINT "course_revisions_promo_video_id_video_assets_id_fk" FOREIGN KEY ("promo_video_id") REFERENCES "public"."video_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_revisions" ADD CONSTRAINT "course_revisions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_revisions" ADD CONSTRAINT "course_revisions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tags" ADD CONSTRAINT "course_tags_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tags" ADD CONSTRAINT "course_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_live_revision_id_course_revisions_id_fk" FOREIGN KEY ("live_revision_id") REFERENCES "public"."course_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_draft_revision_id_course_revisions_id_fk" FOREIGN KEY ("draft_revision_id") REFERENCES "public"."course_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_video_asset_id_video_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."video_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_applications" ADD CONSTRAINT "instructor_applications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_applications" ADD CONSTRAINT "instructor_applications_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_checks" ADD CONSTRAINT "kyc_checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_id_index" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "categories_parent_id_position_index" ON "categories" USING btree ("parent_id","position");--> statement-breakpoint
CREATE INDEX "bundle_courses_course_id_index" ON "bundle_courses" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "bundles_instructor_id_status_index" ON "bundles" USING btree ("instructor_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "course_revisions_course_id_number_index" ON "course_revisions" USING btree ("course_id","number");--> statement-breakpoint
CREATE INDEX "course_revisions_status_submitted_at_index" ON "course_revisions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "course_revisions_cover_file_id_index" ON "course_revisions" USING btree ("cover_file_id");--> statement-breakpoint
CREATE INDEX "course_revisions_promo_video_id_index" ON "course_revisions" USING btree ("promo_video_id");--> statement-breakpoint
CREATE INDEX "course_revisions_reviewed_by_index" ON "course_revisions" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "course_revisions_category_id_index" ON "course_revisions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_staff_course_id_user_id_index" ON "course_staff" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "course_staff_user_id_index" ON "course_staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "course_staff_invited_by_index" ON "course_staff" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "course_tags_tag_id_index" ON "course_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "courses_instructor_id_status_index" ON "courses" USING btree ("instructor_id","status");--> statement-breakpoint
CREATE INDEX "courses_status_published_at_index" ON "courses" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "courses_category_id_index" ON "courses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "courses_live_revision_id_index" ON "courses" USING btree ("live_revision_id");--> statement-breakpoint
CREATE INDEX "courses_draft_revision_id_index" ON "courses" USING btree ("draft_revision_id");--> statement-breakpoint
CREATE INDEX "lesson_resources_lesson_id_position_index" ON "lesson_resources" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE INDEX "lesson_resources_file_id_index" ON "lesson_resources" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "lessons_course_id_section_id_position_index" ON "lessons" USING btree ("course_id","section_id","position");--> statement-breakpoint
CREATE INDEX "lessons_section_id_index" ON "lessons" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "lessons_video_asset_id_index" ON "lessons" USING btree ("video_asset_id");--> statement-breakpoint
CREATE INDEX "sections_course_id_position_index" ON "sections" USING btree ("course_id","position");--> statement-breakpoint
CREATE INDEX "instructor_applications_user_id_created_at_index" ON "instructor_applications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "instructor_applications_status_submitted_at_index" ON "instructor_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "instructor_applications_reviewer_id_index" ON "instructor_applications" USING btree ("reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instructor_applications_one_open" ON "instructor_applications" USING btree ("user_id") WHERE "instructor_applications"."status" in ('draft', 'submitted', 'in_review');--> statement-breakpoint
CREATE INDEX "kyc_checks_user_id_created_at_index" ON "kyc_checks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payout_accounts_user_id_index" ON "payout_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_one_active" ON "payout_accounts" USING btree ("user_id") WHERE "payout_accounts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "video_assets_owner_id_created_at_index" ON "video_assets" USING btree ("owner_id","created_at");
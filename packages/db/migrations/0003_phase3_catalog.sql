-- Trigram typo matching for course search (docs/05 catalog). Neon and stock Postgres ship pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."slug_kind" AS ENUM('course', 'instructor', 'category');--> statement-breakpoint
CREATE TABLE "course_search" (
	"course_id" uuid PRIMARY KEY NOT NULL,
	"document" "tsvector" NOT NULL,
	"title_norm" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"cover_key" text,
	"instructor_id" uuid NOT NULL,
	"instructor_name" text NOT NULL,
	"instructor_slug" text,
	"category_id" uuid,
	"parent_category_id" uuid,
	"price_kobo" bigint NOT NULL,
	"compare_at_kobo" bigint,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"is_free" boolean NOT NULL,
	"level" "course_level" NOT NULL,
	"language" text NOT NULL,
	"certificate_mode" "certificate_mode" NOT NULL,
	"total_duration_sec" integer DEFAULT 0 NOT NULL,
	"lesson_count" integer DEFAULT 0 NOT NULL,
	"enrollment_count" integer DEFAULT 0 NOT NULL,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"popularity_score" real DEFAULT 0 NOT NULL,
	"featured_at" timestamp with time zone,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "slug_kind" NOT NULL,
	"from_slug" text NOT NULL,
	"target_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "featured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "course_search" ADD CONSTRAINT "course_search_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_search" ADD CONSTRAINT "course_search_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_search" ADD CONSTRAINT "course_search_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_search" ADD CONSTRAINT "course_search_parent_category_id_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_search_document_idx" ON "course_search" USING gin ("document");--> statement-breakpoint
CREATE INDEX "course_search_title_trgm_idx" ON "course_search" USING gin ("title_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "course_search_category_id_published_at_index" ON "course_search" USING btree ("category_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "course_search_parent_category_id_published_at_index" ON "course_search" USING btree ("parent_category_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "course_search_instructor_id_index" ON "course_search" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "course_search_popularity_score_published_at_index" ON "course_search" USING btree ("popularity_score" DESC NULLS LAST,"published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "course_search_published_at_index" ON "course_search" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "course_search_price_kobo_index" ON "course_search" USING btree ("price_kobo");--> statement-breakpoint
CREATE INDEX "course_search_featured_idx" ON "course_search" USING btree ("featured_at" DESC NULLS LAST) WHERE "course_search"."featured_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirects_kind_from_slug_index" ON "slug_redirects" USING btree ("kind","from_slug");--> statement-breakpoint
CREATE INDEX "slug_redirects_target_id_index" ON "slug_redirects" USING btree ("target_id");
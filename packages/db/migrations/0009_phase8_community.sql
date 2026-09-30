CREATE TYPE "public"."reaction_kind" AS ENUM('like');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('thread', 'post');--> statement-breakpoint
CREATE TYPE "public"."thread_kind" AS ENUM('discussion', 'question', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."thread_scope" AS ENUM('course', 'cohort', 'lesson');--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body_doc" jsonb NOT NULL,
	"body_html" text NOT NULL,
	"is_instructor_answer" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reaction_kind" DEFAULT 'like' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_post_id_user_id_kind_pk" PRIMARY KEY("post_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "thread_reads" (
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "thread_reads_user_id_thread_id_pk" PRIMARY KEY("user_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"scope_type" "thread_scope" NOT NULL,
	"scope_id" uuid NOT NULL,
	"kind" "thread_kind" NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_doc" jsonb NOT NULL,
	"body_html" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"accepted_post_id" uuid,
	"answered_at" timestamp with time zone,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_hidden_by_user_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_reads" ADD CONSTRAINT "thread_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_reads" ADD CONSTRAINT "thread_reads_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_hidden_by_user_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_thread_id_created_at_index" ON "posts" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_author_id_index" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "posts_parent_id_index" ON "posts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "posts_hidden_by_index" ON "posts" USING btree ("hidden_by");--> statement-breakpoint
CREATE INDEX "reactions_user_id_index" ON "reactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_target_type_target_id_reporter_id_index" ON "reports" USING btree ("target_type","target_id","reporter_id");--> statement-breakpoint
CREATE INDEX "reports_open_idx" ON "reports" USING btree ("created_at") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_course_id_status_index" ON "reports" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "reports_reporter_id_index" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "reports_handled_by_index" ON "reports" USING btree ("handled_by");--> statement-breakpoint
CREATE INDEX "thread_reads_thread_id_index" ON "thread_reads" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "threads_scope_type_scope_id_last_activity_at_index" ON "threads" USING btree ("scope_type","scope_id","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "threads_course_id_kind_last_activity_at_index" ON "threads" USING btree ("course_id","kind","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "threads_unanswered_idx" ON "threads" USING btree ("course_id","created_at") WHERE "threads"."kind" = 'question' and "threads"."answered_at" is null and "threads"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "threads_author_id_index" ON "threads" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "threads_hidden_by_index" ON "threads" USING btree ("hidden_by");
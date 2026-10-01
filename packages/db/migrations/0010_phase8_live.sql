CREATE TYPE "public"."live_recording_status" AS ENUM('none', 'importing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."live_session_status" AS ENUM('scheduled', 'live', 'ended', 'cancelled');--> statement-breakpoint
CREATE TABLE "live_attendance" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"total_sec" integer DEFAULT 0 NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_attendance_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"cohort_id" uuid,
	"lesson_id" uuid,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "live_session_status" DEFAULT 'scheduled' NOT NULL,
	"recording_enabled" boolean DEFAULT true NOT NULL,
	"daily_room_name" text,
	"daily_room_url" text,
	"room_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"recording_status" "live_recording_status" DEFAULT 'none' NOT NULL,
	"daily_recording_id" text,
	"recording_duration_sec" integer,
	"recording_title" text,
	"recording_video_asset_id" uuid,
	CONSTRAINT "live_sessions_dailyRoomName_unique" UNIQUE("daily_room_name"),
	CONSTRAINT "live_sessions_time_order" CHECK ("live_sessions"."ends_at" > "live_sessions"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_recording_video_asset_id_video_assets_id_fk" FOREIGN KEY ("recording_video_asset_id") REFERENCES "public"."video_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_attendance_user_id_index" ON "live_attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_sessions_course_id_starts_at_index" ON "live_sessions" USING btree ("course_id","starts_at");--> statement-breakpoint
CREATE INDEX "live_sessions_cohort_id_index" ON "live_sessions" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "live_sessions_lesson_id_index" ON "live_sessions" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "live_sessions_created_by_index" ON "live_sessions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "live_sessions_recording_video_asset_id_index" ON "live_sessions" USING btree ("recording_video_asset_id");--> statement-breakpoint
CREATE INDEX "live_sessions_upcoming_idx" ON "live_sessions" USING btree ("starts_at") WHERE "live_sessions"."status" = 'scheduled';
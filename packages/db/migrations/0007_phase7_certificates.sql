CREATE TYPE "public"."certificate_basis" AS ENUM('completion', 'exam', 'external');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."external_exam_result" AS ENUM('pass', 'fail');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'exam_evidence' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instructor_id" uuid,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"public_code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"basis" "certificate_basis" NOT NULL,
	"quiz_attempt_id" uuid,
	"external_result_id" uuid,
	"recipient_name_snapshot" text NOT NULL,
	"course_title_snapshot" text NOT NULL,
	"instructor_name_snapshot" text NOT NULL,
	"provider_name_snapshot" text,
	"issued_at" timestamp with time zone NOT NULL,
	"file_id" uuid,
	"status" "certificate_status" DEFAULT 'active' NOT NULL,
	"revoked_reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"name_corrected_at" timestamp with time zone,
	CONSTRAINT "certificates_publicCode_unique" UNIQUE("public_code"),
	CONSTRAINT "certificates_revoked_has_reason" CHECK ("certificates"."status" = 'active' or ("certificates"."revoked_reason" is not null and "certificates"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "external_exam_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_name" text NOT NULL,
	"exam_url" text,
	"result" "external_exam_result" NOT NULL,
	"score" numeric(10, 2),
	"evidence_file_id" uuid,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_revisions" ADD COLUMN "certificate_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "certificate_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_quiz_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("quiz_attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_external_result_id_external_exam_results_id_fk" FOREIGN KEY ("external_result_id") REFERENCES "public"."external_exam_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_exam_results" ADD CONSTRAINT "external_exam_results_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_exam_results" ADD CONSTRAINT "external_exam_results_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_exam_results" ADD CONSTRAINT "external_exam_results_evidence_file_id_files_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_exam_results" ADD CONSTRAINT "external_exam_results_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_templates_instructor_id_index" ON "certificate_templates" USING btree ("instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_user_id_course_id_index" ON "certificates" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "certificates_course_id_issued_at_index" ON "certificates" USING btree ("course_id","issued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "certificates_enrollment_id_index" ON "certificates" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "certificates_quiz_attempt_id_index" ON "certificates" USING btree ("quiz_attempt_id");--> statement-breakpoint
CREATE INDEX "certificates_external_result_id_index" ON "certificates" USING btree ("external_result_id");--> statement-breakpoint
CREATE INDEX "certificates_file_id_index" ON "certificates" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "certificates_revoked_by_index" ON "certificates" USING btree ("revoked_by");--> statement-breakpoint
CREATE INDEX "external_exam_results_course_id_recorded_at_index" ON "external_exam_results" USING btree ("course_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "external_exam_results_user_id_course_id_index" ON "external_exam_results" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "external_exam_results_evidence_file_id_index" ON "external_exam_results" USING btree ("evidence_file_id");--> statement-breakpoint
CREATE INDEX "external_exam_results_recorded_by_index" ON "external_exam_results" USING btree ("recorded_by");
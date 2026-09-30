CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted', 'auto_submitted', 'graded', 'void');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('single', 'multiple', 'true_false', 'short_text', 'ordering', 'matching');--> statement-breakpoint
CREATE TYPE "public"."quiz_kind" AS ENUM('practice', 'graded', 'exam');--> statement-breakpoint
CREATE TYPE "public"."assignment_due_mode" AS ENUM('none', 'days_after_enrollment', 'cohort_date');--> statement-breakpoint
CREATE TYPE "public"."grade_decision" AS ENUM('graded', 'returned');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'grading', 'graded', 'returned');--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" jsonb NOT NULL,
	"is_correct" boolean,
	"points_awarded" numeric(10, 2),
	"answered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_answers_attempt_id_question_id_pk" PRIMARY KEY("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "question_banks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bank_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt_doc" jsonb NOT NULL,
	"prompt_html" text NOT NULL,
	"options" jsonb NOT NULL,
	"answer" jsonb NOT NULL,
	"explanation_doc" jsonb,
	"explanation_html" text,
	"points" smallint DEFAULT 1 NOT NULL,
	"difficulty" "question_difficulty",
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "questions_points" CHECK ("questions"."points" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_no" smallint NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"question_ids" uuid[] NOT NULL,
	"option_orders" jsonb NOT NULL,
	"score" numeric(10, 2),
	"max_score" numeric(10, 2),
	"passed" boolean,
	"integrity" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"void_reason" text,
	"voided_by" uuid,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"quiz_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_questions_quiz_id_question_id_pk" PRIMARY KEY("quiz_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "quiz_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"bank_id" uuid NOT NULL,
	"question_count" smallint NOT NULL,
	"tag_filter" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "quiz_sources_count" CHECK ("quiz_sources"."question_count" between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" "quiz_kind" DEFAULT 'practice' NOT NULL,
	"title" text NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"instructions_doc" jsonb,
	"instructions_html" text,
	"submission_types" text[] DEFAULT '{text}'::text[] NOT NULL,
	"max_files" smallint DEFAULT 3 NOT NULL,
	"max_file_mb" smallint DEFAULT 20 NOT NULL,
	"rubric" jsonb,
	"max_score" numeric(10, 2) DEFAULT 100 NOT NULL,
	"pass_pct" smallint DEFAULT 50 NOT NULL,
	"due_mode" "assignment_due_mode" DEFAULT 'none' NOT NULL,
	"due_days" smallint,
	"late_policy" jsonb DEFAULT '{"mode":"accept"}'::jsonb NOT NULL,
	"resubmissions_allowed" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "assignments_pass_pct" CHECK ("assignments"."pass_pct" between 0 and 100),
	CONSTRAINT "assignments_limits" CHECK ("assignments"."max_files" between 0 and 10 and "assignments"."max_file_mb" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid NOT NULL,
	"grader_id" uuid NOT NULL,
	"decision" "grade_decision" DEFAULT 'graded' NOT NULL,
	"rubric_scores" jsonb,
	"score" numeric(10, 2),
	"max_score" numeric(10, 2),
	"passed" boolean,
	"feedback_doc" jsonb,
	"feedback_html" text,
	"graded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "grades_submissionId_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_no" smallint NOT NULL,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"text_doc" jsonb,
	"text_html" text,
	"file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"link" text,
	"submitted_at" timestamp with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"late_penalty_pct" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."question_banks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sources" ADD CONSTRAINT "quiz_sources_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sources" ADD CONSTRAINT "quiz_sources_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."question_banks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_grader_id_user_id_fk" FOREIGN KEY ("grader_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_answers_question_id_index" ON "attempt_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_banks_course_id_index" ON "question_banks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "question_banks_owner_id_index" ON "question_banks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "questions_bank_id_position_index" ON "questions" USING btree ("bank_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_one_in_progress" ON "quiz_attempts" USING btree ("quiz_id","user_id") WHERE "quiz_attempts"."status" = 'in_progress';--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_quiz_id_user_id_attempt_no_index" ON "quiz_attempts" USING btree ("quiz_id","user_id","attempt_no");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_id_index" ON "quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_deadline" ON "quiz_attempts" USING btree ("deadline_at") WHERE "quiz_attempts"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "quiz_attempts_flagged" ON "quiz_attempts" USING btree ("quiz_id") WHERE "quiz_attempts"."flagged";--> statement-breakpoint
CREATE INDEX "quiz_attempts_voided_by_index" ON "quiz_attempts" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "quiz_questions_question_id_index" ON "quiz_questions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "quiz_sources_quiz_id_index" ON "quiz_sources" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_sources_bank_id_index" ON "quiz_sources" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "quizzes_course_id_index" ON "quizzes" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "assignments_course_id_index" ON "assignments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "grades_grader_id_index" ON "grades" USING btree ("grader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_assignment_id_user_id_attempt_no_index" ON "submissions" USING btree ("assignment_id","user_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_one_draft" ON "submissions" USING btree ("assignment_id","user_id") WHERE "submissions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "submissions_user_id_index" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submissions_queue" ON "submissions" USING btree ("assignment_id","submitted_at") WHERE "submissions"."status" in ('submitted', 'grading');--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_quiz_id_index" ON "lessons" USING btree ("quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_assignment_id_index" ON "lessons" USING btree ("assignment_id");
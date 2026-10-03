ALTER TYPE "public"."file_purpose" ADD VALUE 'statement' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "earning_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"month" char(7) NOT NULL,
	"file_id" uuid,
	"totals" jsonb NOT NULL,
	"emailed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "earning_statements" ADD CONSTRAINT "earning_statements_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earning_statements" ADD CONSTRAINT "earning_statements_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "earning_statements_instructor_id_month_index" ON "earning_statements" USING btree ("instructor_id","month");--> statement-breakpoint
CREATE INDEX "earning_statements_file_id_index" ON "earning_statements" USING btree ("file_id");
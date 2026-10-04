CREATE TABLE "instructor_strikes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"reason" text NOT NULL,
	"course_id" uuid,
	"issued_by" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text
);
--> statement-breakpoint
ALTER TABLE "instructor_strikes" ADD CONSTRAINT "instructor_strikes_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_strikes" ADD CONSTRAINT "instructor_strikes_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_strikes" ADD CONSTRAINT "instructor_strikes_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instructor_strikes_instructor_id_created_at_index" ON "instructor_strikes" USING btree ("instructor_id","created_at");
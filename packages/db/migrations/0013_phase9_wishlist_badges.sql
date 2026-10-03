ALTER TABLE "coupons" ADD COLUMN "announced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "badges_public" boolean DEFAULT false NOT NULL;
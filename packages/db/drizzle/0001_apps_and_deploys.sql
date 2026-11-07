ALTER TYPE "public"."build_type" ADD VALUE 'image';--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "trigger" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "error" text;
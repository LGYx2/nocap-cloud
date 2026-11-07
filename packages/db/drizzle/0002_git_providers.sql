CREATE TYPE "public"."git_provider_type" AS ENUM('github', 'gitlab');--> statement-breakpoint
CREATE TABLE "git_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "git_provider_type" NOT NULL,
	"name" text NOT NULL,
	"config_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "git_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "repo_full_name" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "auto_deploy" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "deploy_token" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_git_provider_id_git_providers_id_fk" FOREIGN KEY ("git_provider_id") REFERENCES "public"."git_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_repo_idx" ON "applications" USING btree ("repo_full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_deploy_token_unique" ON "applications" USING btree ("deploy_token");
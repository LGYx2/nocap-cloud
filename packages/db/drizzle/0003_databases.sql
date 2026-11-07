CREATE TYPE "public"."database_engine" AS ENUM('postgres', 'mysql', 'mariadb', 'mongodb', 'redis');--> statement-breakpoint
CREATE TYPE "public"."database_status" AS ENUM('starting', 'running', 'stopped', 'failed');--> statement-breakpoint
CREATE TABLE "database_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"variable" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"engine" "database_engine" NOT NULL,
	"version" text NOT NULL,
	"db_name" text NOT NULL,
	"username" text NOT NULL,
	"password_enc" text NOT NULL,
	"status" "database_status" DEFAULT 'starting' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "release_command" text;--> statement-breakpoint
ALTER TABLE "database_links" ADD CONSTRAINT "database_links_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_links" ADD CONSTRAINT "database_links_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "database_links_app_variable_unique" ON "database_links" USING btree ("application_id","variable");--> statement-breakpoint
CREATE INDEX "database_links_database_id_idx" ON "database_links" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "databases_project_id_idx" ON "databases" USING btree ("project_id");
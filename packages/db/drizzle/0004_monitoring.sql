CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"target_id" text,
	"title" text NOT NULL,
	"detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"target" text NOT NULL,
	"cpu" real NOT NULL,
	"memory" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uptime_checks" (
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_id" uuid NOT NULL,
	"ok" boolean NOT NULL,
	"status" integer,
	"ms" integer
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "stack" text;--> statement-breakpoint
ALTER TABLE "uptime_checks" ADD CONSTRAINT "uptime_checks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_started_at_idx" ON "incidents" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "metrics_target_at_idx" ON "metrics" USING btree ("target","at");--> statement-breakpoint
CREATE INDEX "uptime_checks_app_at_idx" ON "uptime_checks" USING btree ("application_id","at");
CREATE TABLE "gsc_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsc_connections_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "gsc_search_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" text NOT NULL,
	"query" text,
	"page" text,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" real DEFAULT 0 NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"country" text,
	"device" text,
	CONSTRAINT "gsc_search_performance_project_id_date_query_page_unique" UNIQUE("project_id","date","query","page")
);
--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_search_performance" ADD CONSTRAINT "gsc_search_performance_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_gsc_perf_project_date" ON "gsc_search_performance" USING btree ("project_id","date");